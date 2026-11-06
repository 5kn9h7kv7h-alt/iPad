// Which character model each resident wears (deterministic, from occupation / age / gender).
import type { Citizen } from '../../sim/types';

export const MODELS = [
  'Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald',
  'OldClassy_Male', 'OldClassy_Female', 'Suit_Male', 'Suit_Female', 'Worker_Male', 'Worker_Female', 'Chef_Male', 'Chef_Female',
] as const;
export type ModelName = typeof MODELS[number];

const hash = (s: string) => { let h = 3; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };

export function modelFor(c: Citizen): ModelName {
  const f = c.gender === 'f', o = c.occupation, h = hash(c.id);
  if (/料理人|板前/.test(o)) return f ? 'Chef_Female' : 'Chef_Male';
  if (c.age > 62) return f ? 'OldClassy_Female' : 'OldClassy_Male';
  if (/漁師|倉庫|市場|作業/.test(o)) return f ? 'Worker_Female' : 'Worker_Male';
  if (/職員|駅員|ガイド|事務|研究/.test(o)) return f ? 'Suit_Female' : 'Suit_Male';
  const casual = f ? (['Casual_Female', 'Casual2_Female', 'Casual3_Female'] as const) : (['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Bald'] as const);
  return casual[h % casual.length];
}
