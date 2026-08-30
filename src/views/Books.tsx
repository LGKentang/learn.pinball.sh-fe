import { useEffect, useMemo, useRef, useState } from 'react';
import { api, STATE_LABEL, type BookSummary, type State } from '../api';
import { ErrorNote } from '../ui';
import { useGraph } from '../graph';

const COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};

interface Hit {
  key: string;
  bookId: string;
  /** Set when the match was a question rather than the book itself. */
  questionId?: string;
  title: string;
  sub: string;
  state?: State;
  /** Books only: shown with a live marker when the book has a public page. */
  published?: boolean;
}

/**
 * The one place every book is chosen from: search across books and questions,
 * create a new one, or pick an existing one to enter. Picking a question opens its
 * book with that question already selected, so search doubles as a jump-to.
 */
export function Books({ go }: { go: (h: string) => void }) {
  const { graph } = useGraph();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setBooks(await api.books());
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
    input.current?.focus();
  }, []);

  async function create() {
    const t = title.trim();
    if (!t) return;
    try {
      const created = await api.createBook(t, intent.trim() || null);
      setTitle('');
      setIntent('');
      setCreating(false);
      go(`#/b/${created.id}`);
    } catch (e) {
      setError(e);
    }
  }

  const { topics, questions } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const topics: Hit[] = books
      .filter(
        (b) =>
          !needle ||
          b.title.toLowerCase().includes(needle) ||
          (b.intent ?? '').toLowerCase().includes(needle),
      )
      .map((b) => ({
        key: `b-${b.id}`,
        bookId: b.id,
        published: !!b.published_at,
        title: b.title,
        sub: b.intent ?? `${b.question_count} question${b.question_count === 1 ? '' : 's'}`,
      }));

    const questions: Hit[] = !needle || !graph
      ? []
      : [...graph.nodes.values()]
          .filter((n) => n.title.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((n) => ({
            key: `q-${n.id}`,
            bookId: n.bookId,
            questionId: n.id,
            title: n.title,
            sub: n.bookTitle,
            state: n.state,
          }));

    return { topics, questions };
  }, [q, books, graph]);

  const all = [...topics, ...questions];
  useEffect(() => setSel(0), [q]);

  function open(h: Hit) {
    go(h.questionId ? `#/b/${h.bookId}/q/${h.questionId}` : `#/b/${h.bookId}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!all.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => (i + 1) % all.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => (i - 1 + all.length) % all.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (all[sel]) open(all[sel]);
    }
  }

  const stats = (id: string) => {
    if (!graph) return null;
    const ns = [...graph.nodes.values()].filter((n) => n.bookId === id);
    const by: Partial<Record<State, number>> = {};
    for (const n of ns) by[n.state] = (by[n.state] ?? 0) + 1;
    return { total: ns.length, by };
  };

  return (
    <div className="wrap picker">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>Books</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Something you want to understand. Structure emerges as you follow your questions.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancel' : 'New book'}
        </button>
      </div>

      <ErrorNote error={error} />

      {creating && (
        <div className="card" style={{ margin: '16px 0' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            What do you want to understand?
          </div>
          <input
            autoFocus
            className="field"
            placeholder="Understand how TLS certificates work"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <div className="eyebrow" style={{ margin: '14px 0 8px' }}>
            Learning intent <span className="dimmer">— optional, but it is what tells a rabbit hole from the path</span>
          </div>
          <textarea
            className="field"
            rows={2}
            placeholder="Be able to explain what a certificate authority actually vouches for."
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
          />
          <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={() => void create()} disabled={!title.trim()}>
              Start exploring
            </button>
          </div>
        </div>
      )}

      <input
        ref={input}
        className="field picker-input"
        placeholder="Search books and questions…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        style={{ marginTop: 20 }}
      />

      {!books.length && !creating && !q && (
        <div className="empty-state">
          <div className="big">◍</div>
          <p>No books yet.</p>
          <p className="small dimmer">Start with something you genuinely do not understand.</p>
        </div>
      )}

      {!!q && !all.length && (
        <p className="muted small" style={{ marginTop: 20 }}>
          Nothing matches “{q}”.
        </p>
      )}

      {topics.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '22px 0 8px' }}>Books</p>
          <div className="picker-list">
            {topics.map((h, i) => {
              const st = stats(h.bookId);
              return (
                <button
                  key={h.key}
                  className={`picker-row topic ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => open(h)}
                >
                  <span className="t">
                    {h.title}
                    {h.published && <i className="live-dot" title="Published on your site" />}
                  </span>
                  <span className="s">{h.sub}</span>
                  {st && (
                    <span className="meter">
                      {(Object.keys(st.by) as State[]).map((k) => (
                        <i
                          key={k}
                          style={{ background: COLOR[k], width: `${((st.by[k] ?? 0) / st.total) * 100}%` }}
                        />
                      ))}
                      <em>{st.total}</em>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {questions.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '22px 0 8px' }}>Questions</p>
          <div className="picker-list">
            {questions.map((h, i) => (
              <button
                key={h.key}
                className={`picker-row ${topics.length + i === sel ? 'sel' : ''}`}
                onMouseEnter={() => setSel(topics.length + i)}
                onClick={() => open(h)}
              >
                <span className="t">
                  {h.state && <i className="dot" style={{ background: COLOR[h.state] }} />}
                  {h.title}
                </span>
                <span className="s">
                  in {h.sub}
                  {h.state && ` · ${STATE_LABEL[h.state]}`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {!q && all.length > 0 && (
        <p className="small dimmer" style={{ marginTop: 24 }}>
          <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
        </p>
      )}
    </div>
  );
}
