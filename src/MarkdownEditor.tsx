import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { api, uploadImage, type IndexedQuestion } from './api';
import { dropMovedImage, isImageDrag, livePreview, liveTheme, toggleWrap } from './liveMarkdown';

/**
 * A live-preview markdown editor. Formatting renders as you type and the syntax
 * only reappears on the line the cursor is on — so it reads like a document while
 * the underlying value stays plain markdown, which is what the API stores, what
 * revisions diff, and what the server parses [[links]] out of.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 9,
  autoFocus,
  onSubmit,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onSubmit?: () => void;
  /** Shown as context in the expanded view, so you can see what you are answering. */
  title?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const index = useRef<IndexedQuestion[]>([]);
  // held in refs so the editor is built once and never torn down mid-typing
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    void api
      .questionIndex()
      .then((list) => {
        index.current = list;
      })
      .catch(() => undefined);
  }, []);

  /* --------------------------------------------------------------- uploads */

  function swapToken(v: EditorView, token: string, replacement: string) {
    const at = v.state.doc.toString().indexOf(token);
    if (at === -1) return; // the placeholder was deleted; respect that
    v.dispatch({
      changes: { from: at, to: at + token.length, insert: replacement },
      selection: { anchor: at + replacement.length },
    });
  }

  async function insertImages(v: EditorView, files: File[]) {
    setError(null);
    for (const file of files) {
      // a unique token holds the spot, so typing can continue while it uploads
      const token = `![uploading…#${Math.random().toString(36).slice(2, 8)}]()`;
      v.dispatch(v.state.replaceSelection(token));
      setBusy((n) => n + 1);
      try {
        const { url } = await uploadImage(file);
        const alt = (file.name || 'image').replace(/\.[^.]+$/, '');
        swapToken(v, token, `![${alt}](${url})`);
      } catch (e) {
        swapToken(v, token, '');
        setError(e instanceof Error ? e.message : 'upload failed');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  const imagesFrom = (dt: DataTransfer | null): File[] =>
    dt
      ? [...dt.items]
          .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
          .map((i) => i.getAsFile())
          .filter((f): f is File => !!f)
      : [];

  /* ------------------------------------------------------ [[ ]] completion */

  function wikiComplete(ctx: CompletionContext): CompletionResult | null {
    const before = ctx.matchBefore(/\[\[[^\]\n]*/);
    if (!before) return null;
    const query = before.text.slice(2).toLowerCase();
    const options = index.current
      .filter((q) => q.title.toLowerCase().includes(query))
      .slice(0, 12)
      .map((q) => ({
        label: q.title,
        detail: q.exploration_title,
        apply: `[[${q.title}]]`,
        type: 'text',
      }));
    if (!options.length) return null;
    return { from: before.from, options, validFor: /^\[\[[^\]\n]*$/ };
  }

  /* ------------------------------------------------------------ the editor */

  useEffect(() => {
    if (!host.current || view.current) return;

    const extensions: Extension[] = [
      history(),
      markdown({ base: markdownLanguage, addKeymap: false }),
      livePreview,
      liveTheme(expanded),
      closeBrackets(),
      autocompletion({ override: [wikiComplete], icons: false }),
      EditorView.lineWrapping,
      cmPlaceholder(placeholder ?? ''),
      keymap.of([
        {
          key: 'Escape',
          run: () => {
            if (!expanded) return false;
            setExpanded(false);
            return true;
          },
        },
        { key: 'Mod-b', run: (v) => toggleWrap(v, '**') },
        { key: 'Mod-i', run: (v) => toggleWrap(v, '*') },
        { key: 'Mod-e', run: (v) => toggleWrap(v, '`') },
        {
          key: 'Mod-Enter',
          run: () => {
            onSubmitRef.current?.();
            return true;
          },
        },
        ...closeBracketsKeymap,
        ...completionKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current(u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        paste(event, v) {
          const files = imagesFrom(event.clipboardData);
          if (!files.length) return false; // plain text pastes normally
          event.preventDefault();
          void insertImages(v, files);
          return true;
        },
        dragover(event) {
          // a dragged image needs the default prevented or no drop event fires
          if (isImageDrag(event)) {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            return false;
          }
          if (!imagesFrom(event.dataTransfer).length) return false;
          event.preventDefault();
          setDropping(true);
          return false;
        },
        dragleave() {
          setDropping(false);
          return false;
        },
        drop(event, v) {
          setDropping(false);
          // moving an image already in the document takes precedence over a new file
          if (dropMovedImage(v, event)) return true;
          const files = imagesFrom(event.dataTransfer);
          if (!files.length) return false;
          event.preventDefault();
          void insertImages(v, files);
          return true;
        },
      }),
    ];

    const v = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host.current,
    });
    view.current = v;
    if (autoFocus) v.focus();

    return () => {
      v.destroy();
      view.current = null;
    };
    // rebuilt only when the size changes; props are otherwise read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  /** The page behind a modal should not scroll under it. */
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  /** Adopt an external change (switching questions) without fighting live typing. */
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  const toolbar = (
    <div className="md-toolbar">
      <div className="row" style={{ gap: 4 }}>
        <Tool view={view} token="**" title="Bold (Ctrl+B)">
          <b>B</b>
        </Tool>
        <Tool view={view} token="*" title="Italic (Ctrl+I)">
          <i>I</i>
        </Tool>
        <Tool view={view} token="`" title="Inline code (Ctrl+E)">
          {'<>'}
        </Tool>
        <button
          type="button"
          className="md-tool"
          title="Link a question"
          onClick={() => {
            const v = view.current;
            if (!v) return;
            v.dispatch(v.state.replaceSelection('[['));
            v.focus();
          }}
        >
          [[ ]]
        </button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {busy > 0 && (
          <span className="uploading">
            uploading {busy} image{busy === 1 ? '' : 's'}…
          </span>
        )}
        {!expanded && (
          <button
            type="button"
            className="md-tool"
            title="Expand to a full page"
            onClick={() => setExpanded(true)}
          >
            ⤢
          </button>
        )}
      </div>
    </div>
  );

  const surface = (
    <div
      className="md-live"
      style={expanded ? undefined : { minHeight: Math.max(120, rows * 24) }}
      ref={host}
    >
      {dropping && <div className="md-drop">Drop to insert</div>}
    </div>
  );

  const hint = (
    <div className="md-hint">
      <code>**bold**</code> <code>## heading</code> <code>- list</code> <code>&gt; quote</code>{' '}
      <code>`code`</code> <code>[[question]]</code>
      <span className="dimmer">· renders as you type · paste or drop an image</span>
    </div>
  );

  if (expanded) {
    return createPortal(
      <div
        className="md-modal-backdrop"
        onMouseDown={(e) => {
          // only a click on the backdrop itself closes, not a drag ending there
          if (e.target === e.currentTarget) setExpanded(false);
        }}
      >
        <div className="md-modal" role="dialog" aria-modal="true" aria-label={title ?? 'Editor'}>
          <header className="md-modal-head">
            <div className="md-modal-title">
              {title ? <h2>{title}</h2> : <span className="eyebrow">Editing</span>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {busy > 0 && <span className="uploading small">uploading…</span>}
              <button className="btn ghost small" onClick={() => setExpanded(false)}>
                Collapse <span className="dimmer">Esc</span>
              </button>
            </div>
          </header>

          <div className="md-modal-tools">{toolbar}</div>

          <div className="md-modal-body">{surface}</div>

          <footer className="md-modal-foot">
            {hint}
            {onSubmit && (
              <button
                className="btn primary small"
                onClick={() => {
                  setExpanded(false);
                  onSubmitRef.current?.();
                }}
              >
                Save revision
              </button>
            )}
          </footer>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="md-editor">
      {toolbar}
      {surface}
      {error && <div className="err small">{error}</div>}
      {hint}
    </div>
  );
}

function Tool({
  view,
  token,
  title,
  children,
}: {
  view: React.RefObject<EditorView | null>;
  token: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="md-tool"
      title={title}
      onClick={() => view.current && toggleWrap(view.current, token)}
    >
      {children}
    </button>
  );
}
