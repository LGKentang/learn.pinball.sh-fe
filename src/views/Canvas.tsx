import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATE_LABEL, type State } from '../api';
import { ErrorNote } from '../ui';
import { Note } from '../Note';
import { useGraph, stepsFrom, type Graph } from '../graph';
import { layoutGraph, NODE_H, NODE_W, type Layout } from '../canvasLayout';
import { TopicPicker } from './TopicPicker';

const COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.25;
const MAX_K = 1.8;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/**
 * The graph as a node canvas: questions are nodes wired left to right, clicking one
 * docks it in the inspector on the right. Pan by dragging the background, zoom with
 * the wheel, and step through with the inspector's Previous / Next.
 */
export function Canvas({
  go,
  explorationId,
  selectedId,
}: {
  go: (h: string) => void;
  explorationId?: string;
  selectedId?: string;
}) {
  const { graph, error } = useGraph();
  if (error) return <div className="main"><div className="wrap"><ErrorNote error={error} /></div></div>;
  if (!explorationId)
    return (
      <div className="main">
        <TopicPicker graph={graph} go={go} />
      </div>
    );
  if (!graph) return <div className="main"><div className="wrap"><p className="muted">Loading…</p></div></div>;
  return (
    <TopicCanvas key={explorationId} graph={graph} explorationId={explorationId} selectedId={selectedId} go={go} />
  );
}

function TopicCanvas({
  graph,
  explorationId,
  selectedId,
  go,
}: {
  graph: Graph;
  explorationId: string;
  selectedId?: string;
  go: (h: string) => void;
}) {
  const layout = useMemo(() => layoutGraph(graph, explorationId), [graph, explorationId]);
  const topicTitle =
    [...graph.nodes.values()].find((n) => n.explorationId === explorationId)?.explorationTitle ?? 'Topic';

  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 0.8 });
  const [dragging, setDragging] = useState(false);
  const fitted = useRef(false);

  const selected = selectedId && layout.pos.has(selectedId) ? selectedId : undefined;
  const select = useCallback(
    (id: string) => {
      const n = graph.nodes.get(id);
      // following a link out of this topic re-scopes the canvas to where it lands
      go(`#/walk/${n?.explorationId ?? explorationId}/${id}`);
    },
    [go, graph, explorationId],
  );

  /* ------------------------------------------------------------------ view */

  const fit = useCallback(() => {
    const el = stage.current;
    if (!el || !layout) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const k = clampK(Math.min((cw - 80) / layout.width, (ch - 80) / layout.height));
    setView({ k, x: (cw - layout.width * k) / 2, y: (ch - layout.height * k) / 2 });
  }, [layout]);

  useEffect(() => {
    if (layout && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [layout, fit]);

  // wheel must be a non-passive native listener to be preventable
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = clampK(v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        // keep the point under the cursor pinned while zooming
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    // Anything interactive keeps its own press. Capturing the pointer here would
    // retarget the pointerup and the control would never receive its click.
    if ((e.target as HTMLElement).closest('button, .canvas-tools')) return;
    if (e.button !== 0) return;
    setDragging(true);
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) =>
      setView((v) => ({ ...v, x: start.vx + (ev.clientX - start.x), y: start.vy + (ev.clientY - start.y) }));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Bring the selected node into view without yanking the canvas around needlessly. */
  useEffect(() => {
    const el = stage.current;
    if (!el || !layout || !selected) return;
    const p = layout.pos.get(selected);
    if (!p) return;
    setView((v) => {
      const sx = p.x * v.k + v.x;
      const sy = p.y * v.k + v.y;
      const pad = 60;
      const inside =
        sx > pad && sy > pad && sx + NODE_W * v.k < el.clientWidth - pad && sy + NODE_H * v.k < el.clientHeight - pad;
      if (inside) return v;
      return {
        ...v,
        x: el.clientWidth / 2 - (p.x + NODE_W / 2) * v.k,
        y: el.clientHeight / 2 - (p.y + NODE_H / 2) * v.k,
      };
    });
  }, [selected, layout]);

  const neighbours = selected ? neighbourIds(graph, selected) : null;

  return (
    <div className="canvas-page">
      <div className="canvas-stage" ref={stage} onPointerDown={onPointerDown}>
        <div className="canvas-tools">
          <div className="row" style={{ gap: 10 }}>
            <button className="btn topics-btn" onClick={() => go('#/walk')} title="Choose another topic">
              <span className="topics-btn-icon">⌕</span> Topics
            </button>
            <span className="topic-name">{topicTitle}</span>
            <div className="seg">
              <button className="on">Canvas</button>
              <button onClick={() => go('#/map')}>Outline</button>
            </div>
          </div>
          <div className="zoomer">
            <button onClick={() => setView((v) => ({ ...v, k: clampK(v.k * 1.2) }))} title="Zoom in">＋</button>
            <button onClick={() => setView((v) => ({ ...v, k: clampK(v.k / 1.2) }))} title="Zoom out">−</button>
            <button onClick={fit} title="Fit to view">⤢</button>
            <span className="pct">{Math.round(view.k * 100)}%</span>
          </div>
        </div>

        <div
          className={`canvas-world ${dragging ? 'dragging' : ''}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg
            className="canvas-wires"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.edges.map((e) => {
              const on = !selected || e.from === selected || e.to === selected;
              return (
                <path
                  key={e.id}
                  d={e.d}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={e.from === selected || e.to === selected ? 2 : 1.4}
                  strokeOpacity={on ? 0.75 : 0.14}
                  strokeDasharray={e.kind === 'child' ? undefined : '6 4'}
                />
              );
            })}
          </svg>

          {[...layout.pos.entries()].map(([id, p]) => {
            const n = graph.nodes.get(id)!;
            const isSel = id === selected;
            const dim = !!selected && !isSel && !neighbours?.has(id);
            return (
              <button
                key={id}
                className={`cnode ${isSel ? 'sel' : ''} ${dim ? 'dim' : ''} ${n.parked ? 'parked' : ''}`}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                onClick={() => select(id)}
                title={n.title}
              >
                <i className="port in" />
                <i className="port out" />
                <span className="bar" style={{ background: COLOR[n.state] }} />
                <span className="ctitle">{n.title}</span>
                <span className="cfoot">
                  <i className="dot" style={{ background: COLOR[n.state] }} />
                  {STATE_LABEL[n.state]}
                  {n.parked && ' · parked'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Inspector
        graph={graph}
        layout={layout}
        selected={selected}
        select={select}
        go={go}
        explorationId={explorationId}
      />
    </div>
  );
}

function neighbourIds(graph: Graph, id: string): Set<string> {
  const { up, down, across } = stepsFrom(graph, id);
  return new Set([...up, ...down, ...across].map((s) => s.node.id));
}

/* --------------------------------------------------------------- inspector */

function Inspector({
  graph,
  layout,
  selected,
  select,
  go,
  explorationId,
}: {
  graph: Graph;
  layout: Layout;
  selected?: string;
  select: (id: string) => void;
  go: (h: string) => void;
  explorationId: string;
}) {
  if (!selected) {
    return (
      <aside className="inspector empty">
        <p className="eyebrow">Nothing selected</p>
        <p className="muted small">
          Click a question on the canvas to read it here. Drag the background to pan,
          scroll to zoom.
        </p>
      </aside>
    );
  }

  const node = graph.nodes.get(selected)!;
  const { up, down, across } = stepsFrom(graph, selected);
  const i = layout.order.indexOf(selected);
  const prev = i > 0 ? layout.order[i - 1] : null;
  const next = i >= 0 && i < layout.order.length - 1 ? layout.order[i + 1] : null;

  return (
    <aside className="inspector">
      <div className="inspector-body">
        <p className="eyebrow">{node.explorationTitle}</p>
        <h2 className="ititle">{node.title}</h2>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <span className={`state ${node.state}`}>
            <i className="pip" />
            {STATE_LABEL[node.state]}
          </span>
          {node.parked && <span className="parked-tag">parked</span>}
        </div>

        <p className="eyebrow">Understanding</p>
        {node.understanding ? (
          <Note
            className="iunderstanding"
            text={node.understanding}
            onNavigate={(t) => select(t.id)}
          />
        ) : (
          <p className="iempty">
            Nothing written yet — this question is still open.
          </p>
        )}

        <Group title="Came from" steps={up} select={select} />
        <Group title="Opens into" steps={down} select={select} />
        <Group
          title="Connects"
          steps={across.filter((s) => s.node.explorationId === explorationId)}
          select={select}
          showPhrase
        />
        {/* links that leave this topic are not drawn on the canvas, so name them here */}
        <Group
          title="Leads to another topic"
          steps={across.filter((s) => s.node.explorationId !== explorationId)}
          select={select}
          showPhrase
          showTopic
        />
      </div>

      <div className="inspector-foot">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" disabled={!prev} onClick={() => prev && select(prev)}>
            ← Previous
          </button>
          <button className="btn small" disabled={!next} onClick={() => next && select(next)}>
            Next →
          </button>
          <span className="small dimmer" style={{ marginLeft: 'auto' }}>
            {i + 1} / {layout.order.length}
          </span>
        </div>
        <button
          className="btn primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => go(`#/e/${node.explorationId}/q/${node.id}`)}
        >
          Open question
        </button>
      </div>
    </aside>
  );
}

function Group({
  title,
  steps,
  select,
  showPhrase,
  showTopic,
}: {
  title: string;
  steps: ReturnType<typeof stepsFrom>['down'];
  select: (id: string) => void;
  showPhrase?: boolean;
  showTopic?: boolean;
}) {
  if (!steps.length) return null;
  return (
    <section className="igroup">
      <p className="eyebrow">
        {title} <span className="n">{steps.length}</span>
      </p>
      {steps.map((s) => (
        <button key={s.node.id} className="ilink" onClick={() => select(s.node.id)}>
          {showPhrase && (
            <span className="verb" style={{ color: s.color }}>
              {s.phrase}
            </span>
          )}
          <span className="t">{s.node.title}</span>
          {showTopic && <span className="topic">↗ {s.node.explorationTitle}</span>}
          {s.note && <span className="why">{s.note}</span>}
        </button>
      ))}
    </section>
  );
}
