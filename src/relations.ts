import type { RelationKind } from './api';

/**
 * How a connection reads *from one question's side*. Sentence fragments, not
 * category names — a view should say what this question's situation is rather
 * than report which rows exist. `rank` orders by how much the connection bears
 * on understanding: a dependency changes what to study next, "connects to" rarely does.
 */
export const PHRASE: Record<string, { phrase: string; rank: number; color: string }> = {
  'depends_on:out': { phrase: 'needs', rank: 0, color: '#5aa9ff' },
  'depends_on:in': { phrase: 'is needed by', rank: 1, color: '#5aa9ff' },
  'contradicts:out': { phrase: 'clashes with', rank: 2, color: '#ff7a6b' },
  'contradicts:in': { phrase: 'clashes with', rank: 2, color: '#ff7a6b' },
  'example_of:out': { phrase: 'is an example of', rank: 3, color: '#4ec9a0' },
  'example_of:in': { phrase: 'is shown by', rank: 4, color: '#4ec9a0' },
  'related_to:out': { phrase: 'connects to', rank: 5, color: '#b18aff' },
  'related_to:in': { phrase: 'connects to', rank: 5, color: '#b18aff' },
};

export function phraseFor(kind: RelationKind, outgoing: boolean) {
  return PHRASE[`${kind}:${outgoing ? 'out' : 'in'}`];
}
