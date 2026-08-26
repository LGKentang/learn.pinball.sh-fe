import { useEffect, useMemo, useState } from 'react';
import { api, RELATION_LABEL, STATE_LABEL, STATES, type ExplorationDetail, type State } from '../api';
import { ErrorNote } from '../ui';
import { PHRASE } from '../relations';

const COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};

const WIDTH = 900;
const ROW = 26;
const INDENT = 26;
const PAD = 26;
const GROUP_GAP = 40;
const GUTTER = WIDTH - 210; // x where connection arcs live
const MAX_CHARS = 56;
const CHAR_W = 6.35; // 11px monospace advance, close enough to place leader lines

interface Placed {
  id: string;
  title: string;
  label: string;
  state: State;
  parked: boolean;
  x: number;
  y: number;
  textEnd: number;
  parentId: string | null;
  explorationId: string;
}

/**
 * An indented outline with connections routed through a right-hand gutter, rather
 * than a force-directed blob. The map exists to expose depth, dependencies and
 * unexplored branches — a layout that keeps the question text readable does that
 * better than a hairball. Every arc has a leader line back to each endpoint's row,
 * so you can always tell which two questions it joins.
 */
interface Rel {
  phrase: string;
  note: string | null;
  rank: number;
}

interface Conn {
  id: string;
  title: string;
  explorationId: string;
  crosses: boolean;
  rels: Rel[];
}


export function MapView({ go }: { go: (h: string) => void }) {
  const [details, setDetails] = useState<ExplorationDetail[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.explorations();
        setDetails(await Promise.all(list.map((e) => api.exploration(e.id))));
      } catch (e) {
        setError(e);
      }
    })();
  }, []);

  const layout = useMemo(() => {
    if (!details) return null;
    const nodes: Placed[] = [];
    const groups: { title: string; y: number; id: string }[] = [];
    let y = PAD;

    for (const d of details) {
      groups.push({ title: d.exploration.title, y, id: d.exploration.id });
      y += ROW;
      for (const n of d.tree) {
        const label = n.title.length > MAX_CHARS ? `${n.title.slice(0, MAX_CHARS - 1)}…` : n.title;
        const x = PAD + 14 + n.depth * INDENT;
        nodes.push({
          id: n.id,
          title: n.title,
          label,
          state: n.state,
          parked: !!n.parked_at,
          x,
          y,
          textEnd: x + 10 + label.length * CHAR_W,
          parentId: n.parent_id,
          explorationId: d.exploration.id,
        });
        y += ROW;
      }
      y += GROUP_GAP;
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const edges = details
      .flatMap((d) => d.edges)
      .filter((e) => {
        const key = [e.from_id, e.to_id, e.kind].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((e) => ({ ...e, a: byId.get(e.from_id), b: byId.get(e.to_id) }))
      .filter((e): e is typeof e & { a: Placed; b: Placed } => !!e.a && !!e.b);

    // Which questions take part in any connection, and who neighbours whom.
    const neighbours = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!neighbours.has(e.a.id)) neighbours.set(e.a.id, new Set());
      if (!neighbours.has(e.b.id)) neighbours.set(e.b.id, new Set());
      neighbours.get(e.a.id)!.add(e.b.id);
      neighbours.get(e.b.id)!.add(e.a.id);
    }

    return { nodes, groups, edges, height: y, byId, neighbours };
  }, [details]);

  if (error) return <div className="wrap"><ErrorNote error={error} /></div>;
  if (!layout) return <div className="wrap"><p className="muted">Loading…</p></div>;

  const lit = (id: string) =>
    !hover || hover === id || layout.neighbours.get(hover)?.has(id) === true;

  const focused = hover ? layout.byId.get(hover) : undefined;

  /**
   * Keyed on the other question, not on the relation kind — two questions linked
   * twice are one relationship with two things to say about it, and listing the
   * same title under two headings was pure noise.
   */
  const conns: Conn[] = (() => {
    if (!focused) return [];
    const by = new Map<string, Conn>();
    for (const e of layout.edges) {
      if (e.a.id !== focused.id && e.b.id !== focused.id) continue;
      const outgoing = e.a.id === focused.id;
      const other = outgoing ? e.b : e.a;
      const p = PHRASE[`${e.kind}:${outgoing ? 'out' : 'in'}`];
      if (!p) continue;
      if (!by.has(other.id)) {
        by.set(other.id, {
          id: other.id,
          title: other.title,
          explorationId: other.explorationId,
          crosses: !!e.crosses,
          rels: [],
        });
      }
      by.get(other.id)!.rels.push({ phrase: p.phrase, note: e.note, rank: p.rank });
    }
    return [...by.values()]
      .map((c) => ({ ...c, rels: c.rels.sort((x, y) => x.rank - y.rank) }))
      .sort((a, b) => a.rels[0].rank - b.rels[0].rank);
  })();


  return (
    <div className="wrap map-page">
      <div className="spread" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Knowledge map</h1>
        <div className="seg">
          <button onClick={() => go('#/walk')}>Canvas</button>
          <button className="on">Outline</button>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 18 }}>
        Every question at once — depth, dependencies, and what is still unanswered.
        Hover a question to isolate its connections.
      </p>

      <div className="legend" style={{ marginBottom: 14 }}>
        {STATES.map((s) => (
          <span key={s}>
            <b style={{ background: COLOR[s] }} />
            {STATE_LABEL[s]}
          </span>
        ))}
        <span>
          <b style={{ background: '#b18aff' }} />
          connection
        </span>
        <span>
          <b style={{ background: '#e2b352' }} />
          crosses explorations
        </span>
      </div>

      <div className="map-layout">
      <div className="map-wrap">
        <svg viewBox={`0 0 ${WIDTH} ${layout.height}`} role="img" aria-label="Knowledge map">
          {/* the gutter the arcs live in */}
          <line
            x1={GUTTER}
            y1={PAD - 10}
            x2={GUTTER}
            y2={layout.height - GROUP_GAP}
            stroke="#1f2532"
            strokeWidth="1"
          />

          {/* parent/child indent guides */}
          {layout.nodes.map((n) => {
            const p = n.parentId ? layout.byId.get(n.parentId) : undefined;
            if (!p) return null;
            return (
              <path
                key={`g-${n.id}`}
                d={`M ${p.x} ${p.y + 5} V ${n.y} H ${n.x - 5}`}
                fill="none"
                stroke="#262d3b"
                strokeWidth="1"
              />
            );
          })}

          {/* connections: leader → arc → arrowhead */}
          {layout.edges.map((e, i) => {
            const { a, b } = e;
            const active = !hover || hover === a.id || hover === b.id;
            const color = e.crosses ? '#e2b352' : '#b18aff';
            const spread = 24 + ((i % 3) * 14);
            const bow = spread + Math.min(90, Math.abs(a.y - b.y) * 0.3);
            const o = active ? 1 : 0.08;
            return (
              <g key={`${e.from_id}-${e.to_id}-${e.kind}`} opacity={o}>
                <title>
                  {[
                    `${a.title} — ${RELATION_LABEL[e.kind]} → ${b.title}`,
                    e.note ? `Why: ${e.note}` : 'No reason recorded.',
                  ].join('\n\n')}
                </title>
                {/* leaders tie the arc back to each row */}
                <line
                  x1={a.textEnd + 8}
                  y1={a.y}
                  x2={GUTTER}
                  y2={a.y}
                  stroke={color}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.4"
                />
                <line
                  x1={b.textEnd + 8}
                  y1={b.y}
                  x2={GUTTER}
                  y2={b.y}
                  stroke={color}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.4"
                />
                <path
                  d={`M ${GUTTER} ${a.y} C ${GUTTER + bow} ${a.y}, ${GUTTER + bow} ${b.y}, ${GUTTER} ${b.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={hover && active ? 1.8 : 1.2}
                  strokeDasharray={e.crosses ? '5 3' : undefined}
                  opacity="0.85"
                />
                {/* source end */}
                <circle cx={GUTTER} cy={a.y} r="2.5" fill={color} />
                {/* target end: arrowhead pointing back into the row */}
                <path
                  d={`M ${GUTTER - 1} ${b.y} l 7 -3.5 v 7 z`}
                  fill={color}
                />
              </g>
            );
          })}

          {layout.groups.map((g) => (
            <text
              key={g.id}
              x={PAD}
              y={g.y + 4}
              style={{ fill: '#e6e9f0', fontSize: 12, fontWeight: 600 }}
            >
              {g.title}
            </text>
          ))}

          {layout.nodes.map((n) => {
            const on = hover === n.id;
            const linked = layout.neighbours.has(n.id);
            const dim = !lit(n.id);
            return (
              <g
                key={n.id}
                className={`map-node ${on ? 'on' : ''}`}
                opacity={dim ? 0.25 : 1}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => go(`#/e/${n.explorationId}/q/${n.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {/* a ring marks questions that take part in a connection */}
                {linked && (
                  <circle cx={n.x} cy={n.y} r="7" fill="none" stroke="#b18aff" strokeOpacity="0.35" />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.parked ? 3 : 4}
                  fill={n.parked ? 'none' : COLOR[n.state]}
                  stroke={COLOR[n.state]}
                  strokeDasharray={n.parked ? '2 2' : undefined}
                />
                <text
                  x={n.x + 10}
                  y={n.y + 4}
                  style={{
                    fill: on ? '#ff6b4a' : n.parked ? '#6a7386' : '#99a1b3',
                    fontSize: 11,
                  }}
                >
                  {n.label}
                </text>
                <title>
                  {STATE_LABEL[n.state]}
                  {n.parked ? ' · parked' : ''}
                  {linked ? ` · ${layout.neighbours.get(n.id)!.size} connection(s)` : ''}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="map-inspect">
        <div className="map-inspect-body" key={focused?.id ?? 'none'}>
        {focused ? (
          <>
            <p className="conn-head">{focused.title}</p>
            <p className="conn-sub">
              {STATE_LABEL[focused.state]}
              {focused.parked && ' · parked'}
            </p>
            {conns.length ? (
              <ul className="conn-flow">
                {conns.map((c) => (
                  <li key={c.id}>
                    <p className="line">
                      <span className="verb">{c.rels[0].phrase}</span>{' '}
                      <button className="who" onClick={() => go(`#/e/${c.explorationId}/q/${c.id}`)}>
                        {c.title}
                      </button>
                      {c.crosses && <span className="elsewhere">· elsewhere</span>}
                    </p>
                    {c.rels[0].note && <p className="why">{c.rels[0].note}</p>}
                    {/* a second relationship to the same question is an aside, not a new row */}
                    {c.rels.slice(1).map((r, n) => (
                      <p key={n} className="why also">
                        also {r.phrase} it{r.note ? ` — ${r.note}` : ''}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small dimmer" style={{ margin: '10px 0 0' }}>
                Nothing connects to this yet.
              </p>
            )}
          </>
        ) : (
          <p className="small dimmer" style={{ margin: 0 }}>
            Hover a question to see what it connects to, and why.
          </p>
        )}
        </div>
      </aside>
      </div>
    </div>
  );
}
