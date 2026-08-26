import type { Graph, GNode } from './graph';
import type { RelationKind } from './api';

export const NODE_W = 232;
export const NODE_H = 84;
const COL = 300;
const ROW = 108;
const GROUP_GAP = 96;

export interface Pos {
  x: number;
  y: number;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  kind: RelationKind | 'child';
  color: string;
  d: string;
}

export interface Layout {
  pos: Map<string, Pos>;
  edges: CanvasEdge[];
  /** Pre-order walk of every node — the order the sidebar's prev/next tours in. */
  order: string[];
  width: number;
  height: number;
}

const REL_COLOR: Record<string, string> = {
  depends_on: '#5aa9ff',
  contradicts: '#ff7a6b',
  example_of: '#4ec9a0',
  related_to: '#b18aff',
  child: '#4a5678',
};

/** Right and left ports, the way a node editor wires things up. */
const outPort = (p: Pos): Pos => ({ x: p.x + NODE_W, y: p.y + NODE_H / 2 });
const inPort = (p: Pos): Pos => ({ x: p.x, y: p.y + NODE_H / 2 });

function curve(a: Pos, b: Pos): string {
  const dx = Math.max(70, Math.abs(b.x - a.x) * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

/**
 * Tidy left-to-right tree layout for a single topic: depth becomes the column,
 * leaves claim rows in order, and every parent centres on the children it opened
 * up. Scoped to one exploration on purpose — the whole library at once was a wall,
 * not a map. Links leaving the topic are surfaced per node instead of drawn.
 */
export function layoutGraph(graph: Graph, explorationId: string): Layout {
  const pos = new Map<string, Pos>();
  const order: string[] = [];
  let cursor = 0;

  const inScope = (n: GNode) => n.explorationId === explorationId;

  function place(node: GNode, depth: number): number {
    order.push(node.id);
    const kids = (graph.children.get(node.id) ?? [])
      .map((id) => graph.nodes.get(id))
      .filter((n): n is GNode => !!n && inScope(n));

    if (!kids.length) {
      const y = cursor;
      cursor += ROW;
      pos.set(node.id, { x: depth * COL, y });
      return y;
    }
    const ys = kids.map((k) => place(k, depth + 1));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    pos.set(node.id, { x: depth * COL, y });
    return y;
  }

  const roots = [...graph.nodes.values()].filter((n) => inScope(n) && !n.parentId);
  for (const r of roots) place(r, 0);

  const edges: CanvasEdge[] = [];

  for (const [parentId, kids] of graph.children) {
    const a = pos.get(parentId);
    if (!a) continue;
    for (const kid of kids) {
      const b = pos.get(kid);
      if (!b) continue;
      edges.push({
        id: `c-${parentId}-${kid}`,
        from: parentId,
        to: kid,
        kind: 'child',
        color: REL_COLOR.child,
        d: curve(outPort(a), inPort(b)),
      });
    }
  }

  const seen = new Set<string>();
  for (const [id, steps] of graph.relations) {
    if (!pos.has(id)) continue;
    for (const s of steps) {
      // stored from both ends; draw each once, in its stated direction
      if (s.rank % 2 === 1) continue;
      if (!pos.has(s.node.id)) continue; // leaves the topic — the inspector reports it
      const key = [id, s.node.id, s.kind].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: `r-${key}`,
        from: id,
        to: s.node.id,
        kind: s.kind as RelationKind,
        color: REL_COLOR[s.kind] ?? REL_COLOR.related_to,
        d: curve(outPort(pos.get(id)!), inPort(pos.get(s.node.id)!)),
      });
    }
  }

  let width = 0;
  let height = 0;
  for (const p of pos.values()) {
    width = Math.max(width, p.x + NODE_W);
    height = Math.max(height, p.y + NODE_H);
  }

  return { pos, edges, order, width: width + 40, height: height + 40 };
}
