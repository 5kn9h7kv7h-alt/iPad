/** 文字バイグラムの集合。日本語でも分かち書きなしで使える。 */
function bigrams(s: string): Set<string> {
  const t = s.normalize('NFKC').toLowerCase().replace(/[\s、。，．,.!?！？「」『』"'()（）・:：;；\-—]/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  if (t.length === 1) out.add(t);
  return out;
}

/** Jaccard 類似度 0..1 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface Dedupable { title: string; fact: string }

/**
 * 題名＋本文の類似度がこの値以上なら「同じ発見の言い換え」とみなす。
 * 実測に基づく値: 同じ事実の言い換えは 0.33〜0.51、同じ題材でも別の事実は 0.11 以下、無関係な発見は 0.08 以下だった。
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.25;

/**
 * 言い回しが違うだけの「ほぼ同じ発見」を検出する（完全一致のハッシュでは拾えない重複）。
 * AI生成は同じ題材を別の表現で出しやすい。題名は言い換えで大きく変わるため、題名＋本文で判定する。
 */
export function isNearDuplicate(a: Dedupable, b: Dedupable): boolean {
  if (similarity(a.title, b.title) >= 0.7) return true;
  return similarity(`${a.title}${a.fact}`, `${b.title}${b.fact}`) >= NEAR_DUPLICATE_THRESHOLD;
}
