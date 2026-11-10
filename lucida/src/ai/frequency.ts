import { deriveStates } from '../domain/state';
import type { Discovery, Interaction, Prefs } from '../domain/types';

export interface TargetDecision { target: number; base: number; reason: string; shown: number; engaged: number }

const DAY = 86400000;
const MIN_SAMPLE = 6;

/**
 * 提案数の自動調整（Adaptive）。直近7日に見せた発見への反応で、Homeに出す数を ±1 する。
 * - 反応（保存・興味あり・試す予定）が多い → 1件増やす
 * - ほとんど反応がない → 1件減らす（押しつけない）
 * 上限は 5 件、かつ1日の生成上限まで。fixed モードでは調整しない。
 */
export function effectiveTarget(prefs: Prefs, discoveries: Discovery[], interactions: Interaction[], now: Date): TargetDecision {
  const base = prefs.dailyTarget;
  const cap = Math.max(1, Math.min(5, prefs.dailyLimit));
  if (prefs.frequencyMode === 'fixed') return { target: Math.min(base, cap), base, reason: '固定（自動調整オフ）', shown: 0, engaged: 0 };

  const since = now.getTime() - 7 * DAY;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // 今日の分は、まだ反応する時間がないので評価に含めない
  const window = discoveries.filter((d) => { const t = new Date(d.createdAt).getTime(); return t >= since && t < todayStart; });
  const states = deriveStates(interactions);
  const engaged = window.filter((d) => { const s = states.get(d.id); return !!s && (s.saved || s.planned || s.rating === 'like'); }).length;
  const shown = window.length;
  if (shown < MIN_SAMPLE) return { target: Math.min(base, cap), base, reason: 'まだ反応の記録が少ないため、設定どおり', shown, engaged };

  const rate = engaged / shown;
  if (rate >= 0.5) return { target: Math.min(base + 1, cap), base, reason: `直近7日で${shown}件中${engaged}件に反応があったため、1件増やしています`, shown, engaged };
  if (rate <= 0.15) return { target: Math.max(1, Math.min(base - 1, cap)), base, reason: `直近7日で${shown}件中${engaged}件にしか反応がなかったため、1件減らしています`, shown, engaged };
  return { target: Math.min(base, cap), base, reason: '反応は安定しているため、設定どおり', shown, engaged };
}
