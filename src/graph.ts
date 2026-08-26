import { useEffect, useState } from 'react';
import { api, type RelationKind, type State } from './api';
import { phraseFor } from './relations';

export interface GNode {
  id: string;
  title: string;
  state: State;
  parked: boolean;
  understanding: string | null;
  parentId: string | null;
  explorationId: string;
  explorationTitle: string;
}

export interface Step {
  node: GNode;
  /** How the node you came from relates to this one, read from that side. */
  phrase: string;
  rank: number;
  color: string;
  note: string | null;
  kind: RelationKind | 'parent' | 'child';
}

export interface Graph {
  nodes: Map<string, GNode>;
  children: Map<string, string[]>;
  relations: Map<string, Step[]>;
}

/** The whole question graph, across every exploration — walking should not stop at a boundary. */
export function useGraph() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await api.explorations();
        const details = await Promise.all(list.map((e) => api.exploration(e.id)));

        const nodes = new Map<string, GNode>();
        const children = new Map<string, string[]>();
        const relations = new Map<string, Step[]>();

        for (const d of details) {
          for (const t of d.tree) {
            nodes.set(t.id, {
              id: t.id,
              title: t.title,
              state: t.state,
              parked: !!t.parked_at,
              understanding: t.understanding,
              parentId: t.parent_id,
              explorationId: d.exploration.id,
              explorationTitle: d.exploration.title,
            });
            if (t.parent_id) {
              if (!children.has(t.parent_id)) children.set(t.parent_id, []);
              children.get(t.parent_id)!.push(t.id);
            }
          }
        }

        // Cross-exploration edges come back from both sides, so de-duplicate.
        const seen = new Set<string>();
        for (const d of details) {
          for (const e of d.edges) {
            const key = `${e.from_id}|${e.to_id}|${e.kind}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const from = nodes.get(e.from_id);
            const to = nodes.get(e.to_id);
            if (!from || !to) continue;

            const out = phraseFor(e.kind, true);
            const inc = phraseFor(e.kind, false);
            if (!relations.has(from.id)) relations.set(from.id, []);
            if (!relations.has(to.id)) relations.set(to.id, []);
            relations.get(from.id)!.push({ node: to, ...out, note: e.note, kind: e.kind });
            relations.get(to.id)!.push({ node: from, ...inc, note: e.note, kind: e.kind });
          }
        }

        setGraph({ nodes, children, relations });
      } catch (e) {
        setError(e);
      }
    })();
  }, []);

  return { graph, error };
}

/** Everything reachable in one step: up to the parent, down to children, sideways along relations. */
export function stepsFrom(graph: Graph, id: string): { up: Step[]; down: Step[]; across: Step[] } {
  const node = graph.nodes.get(id);
  if (!node) return { up: [], down: [], across: [] };

  const parent = node.parentId ? graph.nodes.get(node.parentId) : undefined;
  const up: Step[] = parent
    ? [{ node: parent, phrase: 'came from', rank: -1, color: '#e2b352', note: null, kind: 'parent' }]
    : [];

  const down: Step[] = (graph.children.get(id) ?? [])
    .map((cid) => graph.nodes.get(cid))
    .filter((n): n is GNode => !!n)
    .map((n) => ({
      node: n,
      phrase: 'opened up',
      rank: 0,
      color: '#ff6b4a',
      note: null,
      kind: 'child' as const,
    }));

  // One entry per neighbour: two links to the same question is one relationship.
  const byNode = new Map<string, Step>();
  for (const s of graph.relations.get(id) ?? []) {
    const prev = byNode.get(s.node.id);
    if (!prev || s.rank < prev.rank) byNode.set(s.node.id, s);
  }
  const across = [...byNode.values()].sort((a, b) => a.rank - b.rank);

  return { up, down, across };
}
