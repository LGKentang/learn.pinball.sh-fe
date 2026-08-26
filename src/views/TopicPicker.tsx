import { useEffect, useMemo, useRef, useState } from 'react';
import { api, STATE_LABEL, type ExplorationSummary, type State } from '../api';
import type { Graph } from '../graph';

const COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};

interface Hit {
  key: string;
  explorationId: string;
  /** Set when the match was a question rather than the topic itself. */
  questionId?: string;
  title: string;
  sub: string;
  state?: State;
}

/**
 * Choose what to map before mapping it. Searching matches topics by title and
 * intent, and questions by title — picking a question opens its topic with that
 * question already selected, so search doubles as a jump-to.
 */
export function TopicPicker({ graph, go }: { graph: Graph | null; go: (h: string) => void }) {
  const [explorations, setExplorations] = useState<ExplorationSummary[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.explorations().then(setExplorations).catch(() => setExplorations([]));
    input.current?.focus();
  }, []);

  const { topics, questions } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const topics: Hit[] = explorations
      .filter(
        (e) =>
          !needle ||
          e.title.toLowerCase().includes(needle) ||
          (e.intent ?? '').toLowerCase().includes(needle),
      )
      .map((e) => ({
        key: `t-${e.id}`,
        explorationId: e.id,
        title: e.title,
        sub: e.intent ?? `${e.question_count} question${e.question_count === 1 ? '' : 's'}`,
      }));

    const questions: Hit[] = !needle || !graph
      ? []
      : [...graph.nodes.values()]
          .filter((n) => n.title.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((n) => ({
            key: `q-${n.id}`,
            explorationId: n.explorationId,
            questionId: n.id,
            title: n.title,
            sub: n.explorationTitle,
            state: n.state,
          }));

    return { topics, questions };
  }, [q, explorations, graph]);

  const all = [...topics, ...questions];
  useEffect(() => setSel(0), [q]);

  function open(h: Hit) {
    go(h.questionId ? `#/walk/${h.explorationId}/${h.questionId}` : `#/walk/${h.explorationId}`);
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
      open(all[sel]);
    }
  }

  const stats = (id: string) => {
    if (!graph) return null;
    const ns = [...graph.nodes.values()].filter((n) => n.explorationId === id);
    const by: Partial<Record<State, number>> = {};
    for (const n of ns) by[n.state] = (by[n.state] ?? 0) + 1;
    return { total: ns.length, by };
  };

  return (
    <div className="wrap picker">
      <h1>Pick a topic to map</h1>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 20 }}>
        The canvas shows one topic at a time. Search a topic, or jump straight to a question.
      </p>

      <input
        ref={input}
        className="field picker-input"
        placeholder="Search topics and questions…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
      />

      {!all.length && (
        <p className="muted small" style={{ marginTop: 20 }}>
          Nothing matches “{q}”.
        </p>
      )}

      {topics.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '22px 0 8px' }}>Topics</p>
          <div className="picker-list">
            {topics.map((h, i) => {
              const st = stats(h.explorationId);
              return (
                <button
                  key={h.key}
                  className={`picker-row topic ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => open(h)}
                >
                  <span className="t">{h.title}</span>
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

      <p className="small dimmer" style={{ marginTop: 24 }}>
        <kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
      </p>
    </div>
  );
}
