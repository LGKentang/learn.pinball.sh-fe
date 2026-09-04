import { useEffect, useMemo, useRef, useState } from 'react';
import { api, STATE_LABEL, type BookSummary, type LibrarySummary, type State } from '../api';
import { ErrorNote } from '../ui';
import { useGraph } from '../graph';
import { STATE_COLOR } from '../stateColors';

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

/** A small, stable (not random-per-render) hash, used to vary spine sizing. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * The one place every book is chosen from: search across books and questions,
 * create a new one, or pick an existing one to enter. Picking a question opens its
 * book with that question already selected, so search doubles as a jump-to.
 *
 * With no search text, books are shown as shelves — grouped by Library, each book a
 * spine whose color bands are its own question-state breakdown. Typing a search
 * switches to the flat, keyboard-navigable results list below instead.
 */
export function Books({ go }: { go: (h: string) => void }) {
  const { graph } = useGraph();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [newLibOpen, setNewLibOpen] = useState(false);
  const [newLibTitle, setNewLibTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [b, l] = await Promise.all([api.books(), api.libraries()]);
      setBooks(b);
      setLibraries(l);
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

  async function moveBook(bookId: string, libraryId: string | null) {
    try {
      await api.updateBook(bookId, { library_id: libraryId });
      await load();
    } catch (e) {
      setError(e);
    }
  }

  async function renameLibrary(id: string, t: string) {
    if (!t.trim()) return;
    try {
      await api.updateLibrary(id, { title: t.trim() });
      await load();
    } catch (e) {
      setError(e);
    }
  }

  async function deleteLibrary(id: string) {
    if (!confirm('Delete this library? Its books become unsorted, not deleted.')) return;
    try {
      await api.deleteLibrary(id);
      await load();
    } catch (e) {
      setError(e);
    }
  }

  async function createLibrary() {
    const t = newLibTitle.trim();
    if (!t) return;
    try {
      await api.createLibrary(t);
      setNewLibTitle('');
      setNewLibOpen(false);
      await load();
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
    if (!q || !all.length) return;
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

  const byLibrary = useMemo(() => {
    const map = new Map<string, BookSummary[]>();
    const unsorted: BookSummary[] = [];
    for (const b of books) {
      if (b.library_id) {
        const arr = map.get(b.library_id) ?? [];
        arr.push(b);
        map.set(b.library_id, arr);
      } else {
        unsorted.push(b);
      }
    }
    return { map, unsorted };
  }, [books]);

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

      {!q && books.length > 0 && (
        <div className="shelves">
          {libraries.map((lib) => (
            <Shelf
              key={lib.id}
              libraryId={lib.id}
              title={lib.title}
              count={lib.book_count}
              books={byLibrary.map.get(lib.id) ?? []}
              stats={stats}
              go={go}
              onMove={moveBook}
              onRename={(t) => void renameLibrary(lib.id, t)}
              onDelete={() => void deleteLibrary(lib.id)}
            />
          ))}

          {(byLibrary.unsorted.length > 0 || libraries.length === 0) && (
            <Shelf
              libraryId={null}
              title="Unsorted"
              count={byLibrary.unsorted.length}
              books={byLibrary.unsorted}
              stats={stats}
              go={go}
              onMove={moveBook}
              unsorted
            />
          )}

          {newLibOpen ? (
            <div className="shelf shelf-new-form">
              <input
                autoFocus
                className="field"
                placeholder="Library name"
                value={newLibTitle}
                onChange={(e) => setNewLibTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void createLibrary()}
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={() => void createLibrary()} disabled={!newLibTitle.trim()}>
                  Create
                </button>
                <button className="btn" onClick={() => setNewLibOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="shelf-new" onClick={() => setNewLibOpen(true)}>
              + New library
            </button>
          )}
        </div>
      )}

      {!!q && !all.length && (
        <p className="muted small" style={{ marginTop: 20 }}>
          Nothing matches “{q}”.
        </p>
      )}

      {!!q && topics.length > 0 && (
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
                      <span className="bar-track">
                        {(Object.keys(st.by) as State[]).map((k) => (
                          <i
                            key={k}
                            style={{ background: STATE_COLOR[k], width: `${((st.by[k] ?? 0) / st.total) * 100}%` }}
                          />
                        ))}
                      </span>
                      <em>{st.total}</em>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {!!q && questions.length > 0 && (
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
                  {h.state && <i className="dot" style={{ background: STATE_COLOR[h.state] }} />}
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

      {!!q && all.length > 0 && (
        <p className="small dimmer" style={{ marginTop: 24 }}>
          <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
        </p>
      )}
    </div>
  );
}

/** The drag payload's MIME type: a book id, and only a book id, is ever on the clipboard. */
const BOOK_DRAG_TYPE = 'application/x-pinball-book-id';

/** One Library's row of book spines, or the "Unsorted" catch-all — a strip-bordered
 * bin rather than a real shelf, since these books haven't been put anywhere yet. */
function Shelf({
  libraryId,
  title,
  count,
  books,
  stats,
  go,
  onMove,
  onRename,
  onDelete,
  unsorted,
}: {
  libraryId: string | null;
  title: string;
  count: number;
  books: BookSummary[];
  stats: (id: string) => { total: number; by: Partial<Record<State, number>> } | null;
  go: (h: string) => void;
  onMove: (bookId: string, libraryId: string | null) => void;
  onRename?: (title: string) => void;
  onDelete?: () => void;
  unsorted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="shelf">
      <div className="shelf-head">
        {editing ? (
          <input
            autoFocus
            className="field shelf-title-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              onRename?.(val);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRename?.(val);
                setEditing(false);
              } else if (e.key === 'Escape') {
                setVal(title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className="shelf-title"
            onClick={() => !unsorted && setEditing(true)}
            title={unsorted ? undefined : 'Rename'}
          >
            {title}
          </button>
        )}
        <span className="shelf-count small dimmer">
          {count} book{count === 1 ? '' : 's'}
        </span>
        {!unsorted && (
          <button className="shelf-del" onClick={onDelete} title="Delete library">
            ×
          </button>
        )}
      </div>
      <div
        className={`shelf-row ${unsorted ? 'shelf-row-unsorted' : ''} ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(BOOK_DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const bookId = e.dataTransfer.getData(BOOK_DRAG_TYPE);
          if (bookId) onMove(bookId, libraryId);
        }}
      >
        {books.length === 0 ? (
          <p className="shelf-empty small dimmer">
            {unsorted ? 'Nothing unsorted.' : 'Drag a book here to shelve it.'}
          </p>
        ) : (
          books.map((b) => <Spine key={b.id} book={b} stats={stats} go={go} />)
        )}
      </div>
    </div>
  );
}

/** One book as a bookshelf spine: width and height vary per book, and the color
 * bands are that book's own question-state breakdown, most-done state on top.
 * Drag it onto another shelf to re-shelve it. */
function Spine({
  book,
  stats,
  go,
}: {
  book: BookSummary;
  stats: (id: string) => { total: number; by: Partial<Record<State, number>> } | null;
  go: (h: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const h = hash(book.id);
  const width = 34 + (h % 22);
  const height = 148 + ((h >> 5) % 46);

  const st = stats(book.id);
  const order: State[] = ['verified', 'can_explain', 'understood', 'exploring', 'unexplored'];
  let gradient = STATE_COLOR.unexplored;
  if (st && st.total) {
    let acc = 0;
    const stops: string[] = [];
    for (const k of order) {
      const n = st.by[k] ?? 0;
      if (!n) continue;
      const pct = (n / st.total) * 100;
      stops.push(`${STATE_COLOR[k]} ${acc}%`, `${STATE_COLOR[k]} ${acc + pct}%`);
      acc += pct;
    }
    if (stops.length) gradient = `linear-gradient(180deg, ${stops.join(', ')})`;
  }

  return (
    <div className={`spine-slot ${dragging ? 'dragging' : ''}`} style={{ width }}>
      <button
        className="spine"
        style={{ height, background: gradient }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(BOOK_DRAG_TYPE, book.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => go(`#/b/${book.id}`)}
        title={book.title}
      >
        <span className="spine-title">{book.title}</span>
      </button>
    </div>
  );
}
