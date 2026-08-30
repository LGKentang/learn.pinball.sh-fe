import { useCallback, useEffect, useState } from 'react';
import {
  api,
  REVISION_LABEL,
  RELATION_LABEL,
  RELATION_KINDS,
  type Book,
  type BookDetail,
  type QuestionDetail,
  type RelationKind,
  type RevisionKind,
  type State,
} from '../api';
import { ErrorNote, QuickAsk, StateBadge, StatePicker } from '../ui';
import { MarkdownEditor } from '../MarkdownEditor';
import { Note, invalidateQuestionIndex } from '../Note';
import { diffStats, wordDiff } from '../diff';

export function BookView({
  bookId,
  questionId,
  go,
}: {
  bookId: string;
  questionId: string | null;
  go: (hash: string) => void;
}) {
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const loadTree = useCallback(async () => {
    try {
      setDetail(await api.book(bookId));
    } catch (e) {
      setError(e);
    }
  }, [bookId]);

  const loadQuestion = useCallback(async (id: string) => {
    try {
      setQuestion(await api.question(id));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (questionId) void loadQuestion(questionId);
    else setQuestion(null);
  }, [questionId, loadQuestion]);

  // Land on the first root question so the workspace is never a blank slate.
  useEffect(() => {
    if (!questionId && detail?.tree.length) go(`#/b/${bookId}/q/${detail.tree[0].id}`);
  }, [questionId, detail, bookId, go]);

  async function refresh() {
    invalidateQuestionIndex();
    await loadTree();
    if (questionId) await loadQuestion(questionId);
  }

  if (!detail) {
    return (
      <div className="wrap">
        <ErrorNote error={error} />
        {!error && <p className="muted">Loading…</p>}
      </div>
    );
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="spread" style={{ padding: '0 6px 12px' }}>
          <a href="#/books" className="small muted">
            ← All books
          </a>
        </div>
        <BookHeader book={detail.book} onSaved={loadTree} onError={setError} />

        {detail.tree.map((n) => (
          <button
            key={n.id}
            className={`tree-node ${n.id === questionId ? 'on' : ''} ${n.parked_at ? 'parked' : ''}`}
            style={{ paddingLeft: 8 + n.depth * 16 }}
            onClick={() => go(`#/b/${bookId}/q/${n.id}`)}
          >
            <i className={`dot ${n.state}`} />
            <span className="label">{n.title}</span>
          </button>
        ))}

        <div style={{ padding: '14px 6px 0' }}>
          <QuickAsk
            placeholder="Ask a new root question…"
            onSubmit={async (title) => {
              const q = await api.createQuestion({ book_id: bookId, title });
              await loadTree();
              go(`#/b/${bookId}/q/${q.id}`);
            }}
          />
        </div>
      </aside>

      <main className="detail">
        <div className="inner">
          <ErrorNote error={error} />
          {question ? (
            <QuestionPane
              detail={question}
              go={go}
              refresh={refresh}
              onError={setError}
              bookId={bookId}
            />
          ) : (
            <div className="empty-state">
              <div className="big">?</div>
              <p>Ask the first question.</p>
              <p className="small dimmer">Start with what you actually do not understand.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * What actually changed, rather than the whole answer again. The trail exists to
 * show how understanding moved, and re-reading two near-identical paragraphs to
 * spot the difference is work the interface should have done.
 */
function DiffBody({ before, after }: { before: string; after: string }) {
  const segs = wordDiff(before, after);
  const { added, removed } = diffStats(segs);
  return (
    <>
      <p className="diff-stat">
        {added > 0 && <span className="add">+{added}</span>}
        {removed > 0 && <span className="del">−{removed}</span>}
        <span className="dimmer">words</span>
      </p>
      <p className="body diff">
        {segs.map((s, i) =>
          s.type === 'same' ? (
            <span key={i}>{s.text}</span>
          ) : s.type === 'add' ? (
            <ins key={i}>{s.text}</ins>
          ) : (
            <del key={i}>{s.text}</del>
          ),
        )}
      </p>
    </>
  );
}

/**
 * Title and learning intent, editable in place. The intent is what separates a
 * rabbit hole from the path, so a topic created without one needs a way to gain
 * one later — not only at the moment of creation.
 */
function BookHeader({
  book,
  onSaved,
  onError,
}: {
  book: Book;
  onSaved: () => Promise<void> | void;
  onError: (e: unknown) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingIntent, setEditingIntent] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [intent, setIntent] = useState(book.intent ?? '');

  useEffect(() => {
    setTitle(book.title);
    setIntent(book.intent ?? '');
    setEditingTitle(false);
    setEditingIntent(false);
  }, [book.id, book.title, book.intent]);

  async function save(patch: { title?: string; intent?: string | null }) {
    try {
      await api.updateBook(book.id, patch);
      await onSaved();
    } catch (e) {
      onError(e);
    }
  }

  async function commitTitle() {
    const t = title.trim();
    setEditingTitle(false);
    if (!t || t === book.title) return setTitle(book.title);
    await save({ title: t });
  }

  return (
    <div className="book-header">
      {editingTitle ? (
        <input
          autoFocus
          className="field title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitTitle();
            if (e.key === 'Escape') {
              setTitle(book.title);
              setEditingTitle(false);
            }
          }}
        />
      ) : (
        <button className="title-edit" onClick={() => setEditingTitle(true)} title="Rename this topic">
          <h2>{book.title}</h2>
          <span className="pencil">✎</span>
        </button>
      )}

      {editingIntent ? (
        <div className="intent-box editing">
          <div className="eyebrow">Learning intent</div>
          <textarea
            autoFocus
            className="field"
            rows={3}
            placeholder="What do you want to be able to explain when you are done?"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIntent(book.intent ?? '');
                setEditingIntent(false);
              }
            }}
          />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8, gap: 6 }}>
            <button
              className="btn ghost small"
              onClick={() => {
                setIntent(book.intent ?? '');
                setEditingIntent(false);
              }}
            >
              Cancel
            </button>
            <button
              className="btn primary small"
              onClick={async () => {
                setEditingIntent(false);
                await save({ intent: intent.trim() || null });
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : book.intent ? (
        <button className="intent-box" onClick={() => setEditingIntent(true)} title="Edit the learning intent">
          <div className="eyebrow">
            Learning intent <span className="pencil">✎</span>
          </div>
          <p>{book.intent}</p>
        </button>
      ) : (
        <button className="intent-add" onClick={() => setEditingIntent(true)}>
          ＋ Set a learning intent
          <span>It is what tells a rabbit hole from the path.</span>
        </button>
      )}
    </div>
  );
}

function QuestionPane({
  detail,
  go,
  refresh,
  onError,
  bookId,
}: {
  detail: QuestionDetail;
  go: (hash: string) => void;
  refresh: () => Promise<void>;
  onError: (e: unknown) => void;
  bookId: string;
}) {
  const { question: q, ancestors, children, relations, revisions } = detail;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.understanding ?? '');
  const [kind, setKind] = useState<RevisionKind>('refinement');
  const [note, setNote] = useState('');
  const [trigger, setTrigger] = useState('');
  const [showTrail, setShowTrail] = useState(false);
  const [asDiff, setAsDiff] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(q.title);

  useEffect(() => {
    setDraft(q.understanding ?? '');
    setEditing(false);
    setKind(q.understanding ? 'refinement' : 'initial');
    setNote('');
    setTrigger('');
    setShowTrail(false);
    setLinking(false);
    setLinked(0);
    setTitle(q.title);
    setEditingTitle(false);
  }, [q.id, q.understanding, q.title]);

  async function save() {
    try {
      const res = await api.revise(q.id, {
        understanding: draft,
        kind,
        note: note.trim() || null,
        triggered_by_question_id: trigger || null,
      });
      setEditing(false);
      setLinked(res.linked);
      await refresh();
    } catch (e) {
      onError(e);
    }
  }

  async function patch(p: Parameters<typeof api.patchQuestion>[1]) {
    try {
      await api.patchQuestion(q.id, p);
      await refresh();
    } catch (e) {
      onError(e);
    }
  }

  /**
   * Renaming is a plain edit, not a revision: the question is the same question,
   * and only `understanding` carries history (Invariant 1). Sharpening the wording
   * of what you are asking should not look like changing your mind about the answer.
   */
  async function commitTitle() {
    const t = title.trim();
    setEditingTitle(false);
    if (!t || t === q.title) return setTitle(q.title);
    await patch({ title: t });
  }

  return (
    <>
      <nav className="crumbs">
        {ancestors.map((a) => (
          <span key={a.id} className="row" style={{ gap: 6 }}>
            <button onClick={() => go(`#/b/${bookId}/q/${a.id}`)}>{a.title}</button>
            <span className="sep">›</span>
          </span>
        ))}
        <span className="dimmer">you are here</span>
      </nav>

      {editingTitle ? (
        <textarea
          autoFocus
          className="field q-title-input"
          rows={2}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            // Enter commits; a question title is one line, so newlines are not wanted.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void commitTitle();
            }
            if (e.key === 'Escape') {
              setTitle(q.title);
              setEditingTitle(false);
            }
          }}
        />
      ) : (
        <button
          className="title-edit q-title-edit"
          onClick={() => setEditingTitle(true)}
          title="Rewrite this question"
        >
          <h1 className="q-title">{q.title}</h1>
          <span className="pencil">✎</span>
        </button>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
        <StateBadge state={q.state} />
        <StatePicker value={q.state} onChange={(s: State) => void patch({ state: s })} />
        {q.parked_at ? (
          <>
            <span className="parked-tag">parked</span>
            <button className="btn ghost small" onClick={() => void patch({ parked: false })}>
              Un-park
            </button>
          </>
        ) : (
          <button
            className="btn ghost small"
            title="Preserve the curiosity without letting it derail the intent"
            onClick={() => {
              const reason = prompt('Why park this? (optional)') ?? '';
              void patch({ parked: true, park_reason: reason || null });
            }}
          >
            Park as rabbit hole
          </button>
        )}
        {!!revisions.length && (
          <button className="btn ghost small" onClick={() => setShowTrail((s) => !s)}>
            {showTrail ? 'Hide' : 'Show'} learning trail ({revisions.length})
          </button>
        )}
      </div>
      {q.park_reason && <p className="small dimmer" style={{ marginTop: 0 }}>{q.park_reason}</p>}

      {/* ------------------------------------------------- current understanding */}
      <section className="section">
        <div className="spread">
          <h2 className="eyebrow">Current understanding</h2>
          {!editing && (
            <button className="btn ghost small" onClick={() => setEditing(true)}>
              {q.understanding ? 'Revise' : 'Write it in your own words'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="card">
            <MarkdownEditor
              autoFocus
              title={q.title}
              rows={9}
              placeholder="Explain it the way you would to someone else…  Use [[ ]] to link another question."
              value={draft}
              onChange={setDraft}
              onSubmit={() => void save()}
            />
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <select
                className="field"
                style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
                value={kind}
                onChange={(e) => setKind(e.target.value as RevisionKind)}
              >
                {(Object.keys(REVISION_LABEL) as RevisionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {REVISION_LABEL[k]}
                  </option>
                ))}
              </select>
              {children.length > 0 && (
                <select
                  className="field"
                  style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                >
                  <option value="">not prompted by a subquestion</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      prompted by: {c.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              className="field"
              style={{ marginTop: 10 }}
              placeholder="What changed, and why? (kept in the trail)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => void save()}>
                Save revision
              </button>
            </div>
          </div>
        ) : (
          <div className={`understanding ${q.understanding ? '' : 'empty'}`}>
            {q.understanding ? (
              <Note
                text={q.understanding}
                onNavigate={(t) => go(`#/b/${t.book_id}/q/${t.id}`)}
                onCreate={async (title) => {
                  await api.createQuestion({
                    book_id: q.book_id,
                    parent_id: q.id,
                    title,
                  });
                  await refresh();
                }}
              />
            ) : (
              'Nothing written yet. What do you currently believe is true?'
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ trail */}
      {showTrail && (
        <section className="section">
          <div className="spread">
            <h2 className="eyebrow">Learning trail</h2>
            <div className="seg small">
              <button className={asDiff ? 'on' : ''} onClick={() => setAsDiff(true)}>
                Changes
              </button>
              <button className={asDiff ? '' : 'on'} onClick={() => setAsDiff(false)}>
                Full text
              </button>
            </div>
          </div>
          <div className="trail">
            {revisions.map((r) => (
              <div key={r.id} className={`trail-step ${r.kind}`}>
                <div className="kind">
                  {REVISION_LABEL[r.kind]}
                  {r.triggered_by_title && (
                    <span className="dimmer"> — after exploring “{r.triggered_by_title}”</span>
                  )}
                </div>
                {r.note && <p className="note">{r.note}</p>}
                {asDiff && r.understanding_before ? (
                  <DiffBody before={r.understanding_before} after={r.understanding_after ?? ''} />
                ) : (
                  <div className="body">
                    <Note text={r.understanding_after} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ subquestions */}
      <section className="section">
        <h2 className="eyebrow">
          Subquestions {children.length > 0 && <span className="dimmer">({children.length})</span>}
        </h2>
        <div className="child-list" style={{ marginBottom: 12 }}>
          {children.map((c) => (
            <button
              key={c.id}
              className="child"
              onClick={() => go(`#/b/${bookId}/q/${c.id}`)}
            >
              <i className={`dot ${c.state}`} style={{ width: 7, height: 7, borderRadius: '50%' }} />
              <span className="grow">{c.title}</span>
              {c.parked_at && <span className="parked-tag">parked</span>}
              <StateBadge state={c.state} />
            </button>
          ))}
          {!children.length && (
            <p className="small dimmer" style={{ margin: 0 }}>
              What would you have to understand first for this answer to hold up?
            </p>
          )}
        </div>
        <QuickAsk
          placeholder="What don't you understand about this yet?"
          onSubmit={async (title) => {
            await api.createQuestion({
              book_id: q.book_id,
              parent_id: q.id,
              title,
            });
            await refresh();
          }}
        />
      </section>

      {/* --------------------------------------------------------- relations */}
      <section className="section">
        <div className="spread">
          <h2 className="eyebrow">Connections</h2>
          <button className="btn ghost small" onClick={() => setLinking((l) => !l)}>
            {linking ? 'Cancel' : 'Link a question'}
          </button>
        </div>

        {linked > 0 && (
          <p className="small" style={{ color: 'var(--violet)', marginTop: 0 }}>
            {linked} connection{linked === 1 ? '' : 's'} added from [[links]] in your notes.
          </p>
        )}

        {linking && <RelationForm questionId={q.id} onDone={refresh} onError={onError} />}

        {relations.length ? (
          relations.map((r) => (
            <div key={r.relation_id} className="rel">
              <div className="rel-main">
                <span className="kind">
                  {r.direction === 'out' ? '→' : '←'} {RELATION_LABEL[r.kind]}
                </span>
                <button
                  className="link grow"
                  onClick={() => go(`#/b/${r.book_id}/q/${r.id}`)}
                >
                  {r.title}
                </button>
                {r.book_id !== bookId && (
                  <span className="cross" title={r.book_title}>
                    {r.book_title}
                  </span>
                )}
                <button
                  className="btn ghost small"
                  title="Remove this connection"
                  onClick={async () => {
                    await api.deleteRelation(r.relation_id);
                    await refresh();
                  }}
                >
                  ✕
                </button>
              </div>
              {/* why the link exists is the whole point of having it */}
              {r.note ? (
                <p className="rel-why">{r.note}</p>
              ) : (
                <p className="rel-why none">No reason recorded for this connection.</p>
              )}
            </div>
          ))
        ) : (
          <p className="small dimmer" style={{ margin: 0 }}>
            Nothing linked yet. Connections can cross books entirely.
          </p>
        )}
      </section>
    </>
  );
}

function RelationForm({
  questionId,
  onDone,
  onError,
}: {
  questionId: string;
  onDone: () => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [options, setOptions] = useState<{ id: string; title: string; book: string }[]>([]);
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState<RelationKind>('related_to');
  const [note, setNote] = useState('');

  useEffect(() => {
    void (async () => {
      const list = await api.books();
      const all = await Promise.all(
        list.map(async (b) =>
          (await api.book(b.id)).tree.map((t) => ({
            id: t.id,
            title: t.title,
            book: b.title,
          })),
        ),
      );
      setOptions(all.flat().filter((o) => o.id !== questionId));
    })();
  }, [questionId]);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select
          className="field"
          style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
          value={kind}
          onChange={(e) => setKind(e.target.value as RelationKind)}
        >
          {RELATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {RELATION_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className="field"
          style={{ flex: 1, minWidth: 200, padding: '6px 8px', fontSize: 13 }}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">choose a question…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.book} — {o.title}
            </option>
          ))}
        </select>
      </div>
      <input
        className="field"
        style={{ marginTop: 10 }}
        placeholder="Why are these connected? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button
          className="btn primary"
          disabled={!target}
          onClick={async () => {
            try {
              await api.createRelation({
                from_id: questionId,
                to_id: target,
                kind,
                note: note.trim() || null,
              });
              await onDone();
            } catch (e) {
              onError(e);
            }
          }}
        >
          Link
        </button>
      </div>
    </div>
  );
}
