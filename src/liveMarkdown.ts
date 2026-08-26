import { syntaxTree } from '@codemirror/language';
import { type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/**
 * Live preview: the document stays plain markdown — which matters, because the
 * database stores markdown, revisions diff it, and the server parses [[links]]
 * out of it — but the syntax is decorated away so you see the rendered result
 * while typing into it.
 *
 * The one rule that makes it feel right: formatting marks hide everywhere except
 * on the line the cursor is on, where the raw text comes back so it can be edited.
 */

/** Set while an image is being dragged, so the drop can move it rather than copy. */
let imageDrag: { from: number; to: number } | null = null;

export const IMAGE_DND_TYPE = 'application/x-pinball-image';

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly raw: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.raw === this.raw;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-img-wrap';
    wrap.draggable = true;

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.className = 'cm-img';
    img.draggable = false; // the wrapper owns the drag
    wrap.appendChild(img);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cm-img-remove';
    remove.title = 'Remove image';
    remove.setAttribute('aria-label', 'Remove image');
    remove.textContent = '✕';
    remove.draggable = false;
    remove.addEventListener('mousedown', (e) => e.preventDefault());
    remove.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // resolve the position now: the document may have changed since render
      const at = view.posAtDOM(wrap);
      view.dispatch({ changes: { from: at, to: at + this.raw.length } });
      view.focus();
    });
    wrap.appendChild(remove);

    wrap.addEventListener('dragstart', (e) => {
      const at = view.posAtDOM(wrap);
      imageDrag = { from: at, to: at + this.raw.length };
      e.dataTransfer?.setData(IMAGE_DND_TYPE, this.raw);
      e.dataTransfer?.setData('text/plain', this.raw);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      wrap.classList.add('dragging');
    });
    wrap.addEventListener('dragend', () => {
      imageDrag = null;
      wrap.classList.remove('dragging');
    });

    return wrap;
  }

  /**
   * Clicks stay with the widget so the remove button works and the caret does not
   * jump inside the image; drag events go through to the editor so a dropped image
   * can land on top of another one.
   */
  ignoreEvent(event: Event) {
    return event.type !== 'drop' && event.type !== 'dragover';
  }
}

export const isImageDrag = (e: DragEvent): boolean =>
  !!e.dataTransfer?.types.includes(IMAGE_DND_TYPE);

/**
 * Move an image to where it was dropped: delete the original span and insert the
 * same markdown at the target, in one transaction so undo takes back the whole move.
 */
export function dropMovedImage(view: EditorView, event: DragEvent): boolean {
  const drag = imageDrag;
  if (!drag || !isImageDrag(event)) return false;
  event.preventDefault();
  imageDrag = null;

  const target = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (target === null || (target >= drag.from && target <= drag.to)) return true;

  const raw = view.state.doc.sliceString(drag.from, drag.to);
  view.dispatch({
    changes:
      target < drag.from
        ? [{ from: target, insert: raw }, { from: drag.from, to: drag.to }]
        : [{ from: drag.from, to: drag.to }, { from: target, insert: raw }],
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const b = document.createElement('span');
    b.className = 'cm-bullet';
    b.textContent = '•';
    return b;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-rule';
    return hr;
  }
}

class WikiWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: WikiWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-wikilink';
    s.textContent = this.label;
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

const hidden = Decoration.replace({});

/** Marks that are pure syntax and can simply disappear. */
const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'StrikethroughMark',
  'QuoteMark',
  'LinkMark',
  'URL',
  'LinkTitle',
]);

const STYLE: Record<string, string> = {
  StrongEmphasis: 'cm-strong',
  Emphasis: 'cm-em',
  Strikethrough: 'cm-strike',
  InlineCode: 'cm-inline-code',
  Link: 'cm-link',
};

const HEADING = /^ATXHeading(\d)$/;
const WIKILINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const deco: Range<Decoration>[] = [];

  // lines the selection touches keep their raw markdown, so it stays editable
  const live = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) live.add(n);
  }
  const isLive = (pos: number) => live.has(state.doc.lineAt(pos).number);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        const heading = HEADING.exec(name);
        if (heading) {
          deco.push(
            Decoration.line({ class: `cm-heading cm-h${heading[1]}` }).range(
              state.doc.lineAt(node.from).from,
            ),
          );
          return;
        }

        if (name === 'Blockquote') {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            deco.push(Decoration.line({ class: 'cm-quote' }).range(state.doc.line(n).from));
          }
          return;
        }

        if (name === 'FencedCode') {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            deco.push(Decoration.line({ class: 'cm-fence' }).range(state.doc.line(n).from));
          }
          return;
        }

        if (name === 'HorizontalRule') {
          if (!isLive(node.from)) {
            deco.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
          }
          return;
        }

        if (name === 'Image') {
          // deliberately not revealed on the cursor line: an image that flickers
          // back to `![](...)` when you click near it is disorienting. Remove it
          // with the button on the image instead.
          const raw = state.doc.sliceString(node.from, node.to);
          const m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(raw);
          if (m) {
            deco.push(
              Decoration.replace({ widget: new ImageWidget(m[2], m[1], raw) }).range(
                node.from,
                node.to,
              ),
            );
          }
          // the whole node is replaced, so its LinkMark/URL children need no work
          return false;
        }

        if (name === 'ListMark') {
          const raw = state.doc.sliceString(node.from, node.to);
          if (/^[-*+]$/.test(raw) && !isLive(node.from)) {
            deco.push(
              Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to),
            );
          }
          return;
        }

        if (STYLE[name]) {
          deco.push(Decoration.mark({ class: STYLE[name] }).range(node.from, node.to));
          return;
        }

        if (MARKS.has(name) && !isLive(node.from)) {
          // an image's URL is consumed by the Image branch above
          deco.push(hidden.range(node.from, node.to));
        }
      },
    });

    // [[wikilinks]] are ours, not markdown's, so they get their own pass
    const text = state.doc.sliceString(from, to);
    WIKILINK.lastIndex = 0;
    for (let m = WIKILINK.exec(text); m; m = WIKILINK.exec(text)) {
      const start = from + m.index;
      if (isLive(start)) continue;
      deco.push(
        Decoration.replace({ widget: new WikiWidget((m[2] || m[1]).trim()) }).range(
          start,
          start + m[0].length,
        ),
      );
    }
  }

  return Decoration.set(deco, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * The editor's own theme. `large` is the expanded modal: a wider measure, bigger
 * type and real page margins, so a long answer reads like a document rather than
 * like a form field.
 */
export const liveTheme = (large = false) =>
  EditorView.theme(
  {
    '&': {
      color: 'var(--text)',
      backgroundColor: 'transparent',
      fontSize: large ? '16px' : '14px',
    },
    '.cm-content': {
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      lineHeight: large ? '1.78' : '1.65',
      padding: large ? '8px 0 40vh' : '12px 14px',
      caretColor: 'var(--accent)',
      maxWidth: large ? '46rem' : 'none',
      margin: large ? '0 auto' : '0',
    },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#2b3550',
    },
    '.cm-placeholder': { color: 'var(--dimmer)' },
    '.cm-line': { padding: '0' },

    '.cm-heading': { fontWeight: '650', letterSpacing: '-0.015em', lineHeight: '1.3' },
    '.cm-h1': { fontSize: large ? '27px' : '19px', marginTop: large ? '28px' : '10px' },
    '.cm-h2': { fontSize: large ? '21px' : '17px', marginTop: large ? '22px' : '8px' },
    '.cm-h3': { fontSize: large ? '17px' : '15px', marginTop: large ? '18px' : '4px' },
    '.cm-h4, .cm-h5, .cm-h6': { fontSize: large ? '15px' : '14px', color: 'var(--dim)' },

    '.cm-strong': { fontWeight: '700', color: '#fff' },
    '.cm-em': { fontStyle: 'italic' },
    '.cm-strike': { textDecoration: 'line-through', color: 'var(--dimmer)' },
    '.cm-inline-code': {
      fontFamily: 'var(--mono)',
      fontSize: '0.88em',
      background: '#0f131c',
      border: '1px solid var(--line-soft)',
      borderRadius: '4px',
      padding: '1px 5px',
    },
    '.cm-link': { color: 'var(--blue)', textDecoration: 'underline', textUnderlineOffset: '2px' },

    '.cm-quote': {
      borderLeft: '2px solid var(--line)',
      paddingLeft: '12px',
      color: 'var(--dim)',
    },
    '.cm-fence': {
      fontFamily: 'var(--mono)',
      fontSize: '12.5px',
      background: '#0b0e14',
    },

    '.cm-bullet': { color: 'var(--accent)' },
    '.cm-rule': {
      display: 'inline-block',
      width: '100%',
      borderTop: '1px solid var(--line)',
      verticalAlign: 'middle',
    },
    '.cm-wikilink': {
      color: 'var(--violet)',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
      textUnderlineOffset: '3px',
      cursor: 'pointer',
    },
    '.cm-img-wrap': { display: 'block', padding: '4px 0' },
    '.cm-img': {
      maxWidth: '100%',
      maxHeight: large ? '520px' : '340px',
      borderRadius: '8px',
      border: '1px solid var(--line)',
      display: 'block',
    },
  },
  { dark: true },
);

/** Wrap the selection in a token, or unwrap it when it is already wrapped. */
export function toggleWrap(view: EditorView, token: string): boolean {
  const { state } = view;
  const r = state.selection.main;
  const n = token.length;
  const before = state.sliceDoc(Math.max(0, r.from - n), r.from);
  const after = state.sliceDoc(r.to, Math.min(state.doc.length, r.to + n));

  if (before === token && after === token) {
    view.dispatch({
      changes: [
        { from: r.from - n, to: r.from },
        { from: r.to, to: r.to + n },
      ],
      selection: { anchor: r.from - n, head: r.to - n },
    });
  } else {
    view.dispatch({
      changes: [
        { from: r.from, insert: token },
        { from: r.to, insert: token },
      ],
      selection: { anchor: r.from + n, head: r.to + n },
    });
  }
  view.focus();
  return true;
}
