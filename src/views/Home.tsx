import { useEffect, useState } from 'react';
import { api, type ExplorationSummary, type Stats } from '../api';
import { ErrorNote, Meter } from '../ui';

/** Per-exploration state counts, fetched alongside the list for the progress meters. */
type WithStats = ExplorationSummary & { stats?: Stats };

export function Home({ go }: { go: (hash: string) => void }) {
  const [items, setItems] = useState<WithStats[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [intent, setIntent] = useState('');

  async function load() {
    try {
      const list = await api.explorations();
      setItems(list);
      const detailed = await Promise.all(
        list.map(async (e) => ({ ...e, stats: (await api.exploration(e.id)).stats })),
      );
      setItems(detailed);
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    const t = title.trim();
    if (!t) return;
    try {
      const created = await api.createExploration(t, intent.trim() || null);
      setTitle('');
      setIntent('');
      setCreating(false);
      go(`#/e/${created.id}`);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="wrap">
      <div className="spread" style={{ marginBottom: 24 }}>
        <div>
          <h1>Explorations</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Something you want to understand. Structure emerges as you follow your questions.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancel' : 'New exploration'}
        </button>
      </div>

      <ErrorNote error={error} />

      {creating && (
        <div className="card" style={{ marginBottom: 20 }}>
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

      {items === null && <p className="muted">Loading…</p>}

      {items?.length === 0 && !creating && (
        <div className="empty-state">
          <div className="big">◍</div>
          <p>No explorations yet.</p>
          <p className="small dimmer">Start with something you genuinely do not understand.</p>
        </div>
      )}

      <div className="explorations">
        {items?.map((e) => (
          <a key={e.id} className="exp-card" href={`#/e/${e.id}`}>
            <div className="spread">
              <h3>{e.title}</h3>
              <span className="mono small dimmer">
                {e.question_count} question{e.question_count === 1 ? '' : 's'}
              </span>
            </div>
            <p className={`intent ${e.intent ? '' : 'none'}`}>
              {e.intent ?? 'No learning intent set.'}
            </p>
            <Meter counts={e.stats?.by_state ?? {}} total={e.stats?.total ?? 0} />
            <div className="row small dimmer" style={{ marginTop: 10, gap: 14 }}>
              {!!e.stats?.due && <span style={{ color: 'var(--accent)' }}>{e.stats.due} due for drill</span>}
              {!!e.open_count && <span>{e.open_count} unanswered</span>}
              {!!e.stats?.parked && <span>{e.stats.parked} parked</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

