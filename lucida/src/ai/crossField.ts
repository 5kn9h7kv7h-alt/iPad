import { CATEGORY_JA, type Discovery } from '../domain/types';

export interface CrossPair { a: Discovery; b: Discovery; bridge: string[]; text: string }

/**
 * 異分野の組み合わせ: すでに出会った発見のうち、カテゴリが違うのに共通のタグを持つ組を探す。
 * 外部通信なし。関連づけは「推測」であり、文面でもそう示す。
 */
export function crossFieldPairs(ds: Discovery[], limit = 3): CrossPair[] {
  const cands: CrossPair[] = [];
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      if (a.category === b.category) continue;
      const bridge = a.tags.filter((t) => b.tags.includes(t));
      if (bridge.length === 0) continue;
      cands.push({
        a, b, bridge,
        text: `「${a.title}」（${CATEGORY_JA[a.category]}）と「${b.title}」（${CATEGORY_JA[b.category]}）は、「${bridge.join('」「')}」という共通のテーマでつながっています。一方の見方を他方に持ち込むと何が見えるか、考えてみる余地があります（推測）。`,
      });
    }
  }
  cands.sort((x, y) => y.bridge.length - x.bridge.length || (y.a.createdAt + y.b.createdAt).localeCompare(x.a.createdAt + x.b.createdAt));
  const used = new Set<string>();
  const out: CrossPair[] = [];
  for (const c of cands) {
    if (used.has(c.a.id) || used.has(c.b.id)) continue;
    used.add(c.a.id); used.add(c.b.id); out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
