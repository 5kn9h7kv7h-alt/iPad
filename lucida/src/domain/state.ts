import type { Interaction } from './types';

export interface DiscoveryState { saved: boolean; rating: 'like' | 'dislike' | null; planned: boolean }

/** 反応の履歴（追記のみ）から、現在の状態を導く。最後の操作が勝つ。 */
export function deriveState(discoveryId: string, interactions: Interaction[]): DiscoveryState {
  const st: DiscoveryState = { saved: false, rating: null, planned: false };
  const mine = interactions.filter((i) => i.discoveryId === discoveryId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const i of mine) {
    if (i.kind === 'save') st.saved = true;
    else if (i.kind === 'unsave') st.saved = false;
    else if (i.kind === 'like') st.rating = 'like';
    else if (i.kind === 'dislike') st.rating = 'dislike';
    else if (i.kind === 'clear_rating') st.rating = null;
    else if (i.kind === 'plan') st.planned = true;
    else if (i.kind === 'unplan') st.planned = false;
  }
  return st;
}

/** 全発見ぶんの状態を一度に導く（発見ごとに履歴を走査しない）。 */
export function deriveStates(interactions: Interaction[]): Map<string, DiscoveryState> {
  const by = new Map<string, Interaction[]>();
  for (const i of interactions) { const a = by.get(i.discoveryId); if (a) a.push(i); else by.set(i.discoveryId, [i]); }
  const out = new Map<string, DiscoveryState>();
  for (const [id, list] of by) out.set(id, deriveState(id, list));
  return out;
}
