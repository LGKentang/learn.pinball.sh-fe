import { useEffect, useState } from 'react';
import { api, RATINGS, RATING_LABEL, STATE_LABEL, type Question, type Rating } from '../api';
import { ErrorNote, StateBadge } from '../ui';
import { MarkdownEditor } from '../MarkdownEditor';
import { Note } from '../Note';

const RATING_HINT: Record<Rating, string> = {
  didnt_know: 'back to Exploring · again tomorrow',
  partially_knew: 'capped at Understood · 3 days',
  knew_it: 'at least Understood · 7 days',
  could_explain_deeply: 'at least Can Explain · 21 days',
};

type Due = Question & { exploration_title: string };

export function Drill({ go, onChanged }: { go: (h: string) => void; onChanged: () => void }) {
  const [queue, setQueue] = useState<Due[] | null>(null);
  const [i, setI] = useState(0);
  const [recalled, setRecalled] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void (async () => {
      try {
        setQueue((await api.due()).questions);
      } catch (e) {
        setError(e);
      }
    })();
  }, []);

  if (error) return <div className="wrap"><ErrorNote error={error} /></div>;
  if (!queue) return <div className="wrap"><p className="muted">Loading…</p></div>;

  if (!queue.length || i >= queue.length) {
    return (
      <div className="wrap">
        <div className="empty-state">
          <div className="big">✓</div>
          <p>{queue.length ? 'Drill complete.' : 'Nothing due right now.'}</p>
          <p className="small dimmer">
            {queue.length
              ? `${queue.length} question${queue.length === 1 ? '' : 's'} reviewed.`
              : 'Questions enter the rotation once you have written an understanding for them.'}
          </p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => go('#/')}>
            Back to explorations
          </button>
        </div>
      </div>
    );
  }

  const current = queue[i];

  async function rate(rating: Rating) {
    try {
      const res = await api.review(current.id, rating, recalled.trim() || null);
      setResult({ from: STATE_LABEL[res.state_before], to: STATE_LABEL[res.state_after] });
      onChanged();
    } catch (e) {
      setError(e);
    }
  }

  function next() {
    setI((n) => n + 1);
    setRecalled('');
    setRevealed(false);
    setResult(null);
  }

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div className="spread" style={{ marginBottom: 18 }}>
        <span className="eyebrow">
          Drill · {i + 1} of {queue.length}
        </span>
        <span className="small dimmer mono">{current.exploration_title}</span>
      </div>

      <div className="drill-card">
        <div className="eyebrow">Explain, from memory</div>
        <h2 className="drill-q">{current.title}</h2>

        {!revealed ? (
          <>
            <MarkdownEditor
              autoFocus
              title={current.title}
              rows={6}
              placeholder="Say it in your own words before you look…"
              value={recalled}
              onChange={setRecalled}
              onSubmit={() => setRevealed(true)}
            />
            <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
              <span className="small dimmer">
                Recognising an explanation is not the same as producing one.
              </span>
              <button className="btn primary" onClick={() => setRevealed(true)}>
                Compare with what I wrote
              </button>
            </div>
          </>
        ) : (
          <>
            {recalled.trim() && (
              <>
                <div className="eyebrow" style={{ marginBottom: 6 }}>What you just said</div>
                <div className="understanding" style={{ borderLeftColor: 'var(--blue)' }}>
                  <Note text={recalled} />
                </div>
              </>
            )}
            <div className="eyebrow" style={{ margin: '20px 0 6px' }}>What you had written</div>
            <div className="understanding">
              <Note text={current.understanding} onNavigate={(t) => go(`#/e/${t.exploration_id}/q/${t.id}`)} />
            </div>

            {result ? (
              <div style={{ marginTop: 22 }}>
                <p className="small muted" style={{ marginBottom: 14 }}>
                  {result.from === result.to ? (
                    <>Understanding stays at <b>{result.to}</b>.</>
                  ) : (
                    <>Understanding moved from <b>{result.from}</b> to <b>{result.to}</b>.</>
                  )}
                </p>
                <button className="btn primary" onClick={next}>
                  {i + 1 >= queue.length ? 'Finish' : 'Next question'}
                </button>
              </div>
            ) : (
              <>
                <div className="eyebrow" style={{ margin: '22px 0 10px' }}>How did that go?</div>
                <div className="ratings">
                  {RATINGS.map((r) => (
                    <button key={r} className={`rate ${r}`} onClick={() => void rate(r)}>
                      <b>{RATING_LABEL[r]}</b>
                      <small>{RATING_HINT[r]}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="row small dimmer" style={{ marginTop: 16, gap: 10 }}>
        <StateBadge state={current.state} />
        <span>current state before this drill</span>
      </div>
    </div>
  );
}
