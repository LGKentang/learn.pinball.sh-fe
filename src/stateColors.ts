import type { State } from './api';

/** The one color mapping for the five understanding states, shared by every
 * node/edge/spine visual in the app instead of being redefined per view. */
export const STATE_COLOR: Record<State, string> = {
  unexplored: '#39415a',
  exploring: '#e2b352',
  understood: '#5aa9ff',
  can_explain: '#4ec9a0',
  verified: '#b18aff',
};
