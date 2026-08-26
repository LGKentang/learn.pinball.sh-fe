import { Fragment, type ReactNode } from 'react';

/**
 * A small markdown subset, rendered to React nodes rather than an HTML string —
 * so [[wikilinks]] become real elements with handlers, and there is no injection
 * surface to sanitise. Supports: headings, bullet/ordered lists, blockquotes,
 * fenced and inline code, rules, bold, italic, strikethrough, links, wikilinks.
 */

export interface WikiLinkProps {
  target: string;
  label: string;
}

interface Ctx {
  renderWikiLink?: (props: WikiLinkProps) => ReactNode;
}

export const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/** Titles referenced by [[ ]] in a chunk of text, de-duplicated, in order. */
export function wikilinkTargets(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------- inline */

const INLINE = [
  { re: /`([^`]+)`/, render: (m: RegExpExecArray) => <code key="c">{m[1]}</code> },
  {
    re: /\*\*([^*]+)\*\*/,
    render: (m: RegExpExecArray, ctx: Ctx) => <strong key="b">{inline(m[1], ctx)}</strong>,
  },
  {
    re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/,
    render: (m: RegExpExecArray, ctx: Ctx) => <em key="i">{inline(m[1], ctx)}</em>,
  },
  {
    re: /_([^_\n]+)_/,
    render: (m: RegExpExecArray, ctx: Ctx) => <em key="i">{inline(m[1], ctx)}</em>,
  },
  {
    re: /~~([^~]+)~~/,
    render: (m: RegExpExecArray, ctx: Ctx) => <del key="s">{inline(m[1], ctx)}</del>,
  },
  {
    re: /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/,
    render: (m: RegExpExecArray, ctx: Ctx) => {
      const target = m[1].trim();
      const label = (m[2] ?? m[1]).trim();
      return ctx.renderWikiLink ? (
        <Fragment key="w">{ctx.renderWikiLink({ target, label })}</Fragment>
      ) : (
        <span key="w" className="wikilink">
          {label}
        </span>
      );
    },
  },
  {
    re: /!\[([^\]]*)\]\(([^)\s]+)\)/,
    render: (m: RegExpExecArray) => (
      <img key="img" src={m[2]} alt={m[1] || ''} loading="lazy" className="md-img" />
    ),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    render: (m: RegExpExecArray, ctx: Ctx) => (
      <a key="a" href={m[2]} target="_blank" rel="noreferrer noopener">
        {inline(m[1], ctx)}
      </a>
    ),
  },
  {
    re: /(https?:\/\/[^\s<>]+[^\s<>.,;:!?)])/,
    render: (m: RegExpExecArray) => (
      <a key="u" href={m[1]} target="_blank" rel="noreferrer noopener">
        {m[1]}
      </a>
    ),
  },
] as const;

function inline(text: string, ctx: Ctx): ReactNode[] {
  if (!text) return [];

  let best: { index: number; match: RegExpExecArray; rule: (typeof INLINE)[number] } | null = null;
  for (const rule of INLINE) {
    const m = new RegExp(rule.re.source, rule.re.flags.replace('g', '')).exec(text);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, match: m, rule };
  }
  if (!best) return [text];

  const { index, match, rule } = best;
  return [
    ...(index > 0 ? [text.slice(0, index)] : []),
    rule.render(match, ctx),
    ...inline(text.slice(index + match[0].length), ctx),
  ];
}

/* -------------------------------------------------------------------- block */

export function Markdown({
  text,
  renderWikiLink,
}: {
  text: string | null | undefined;
  renderWikiLink?: (props: WikiLinkProps) => ReactNode;
}) {
  if (!text?.trim()) return null;
  const ctx: Ctx = { renderWikiLink };
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];

  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(
        <pre key={k()} className="md-code">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={k()} className="md-hr" />);
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      const Tag = `h${level + 2 > 6 ? 6 : level + 2}` as 'h3' | 'h4' | 'h5' | 'h6';
      out.push(
        <Tag key={k()} className={`md-h md-h${level}`}>
          {inline(heading[2], ctx)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(
        <blockquote key={k()} className="md-quote">
          <Markdown text={body.join('\n')} renderWikiLink={renderWikiLink} />
        </blockquote>,
      );
      continue;
    }

    // lists, including nesting by indent
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: { text: string; indent: number }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const raw = lines[i];
        const indent = (/^\s*/.exec(raw)?.[0].length ?? 0) / 2;
        items.push({ text: raw.replace(/^\s*([-*+]|\d+[.)])\s+/, ''), indent });
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      out.push(
        <Tag key={k()} className="md-list">
          {items.map((it, n) => (
            <li key={n} style={{ marginLeft: it.indent * 16 }}>
              {inline(it.text, ctx)}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    // paragraph: consume until a blank line or another block starts
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>\s?|```|\s*([-*+]|\d+[.)])\s+|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={k()} className="md-p">
        {inline(para.join('\n'), ctx)}
      </p>,
    );
  }

  return <div className="md">{out}</div>;
}
