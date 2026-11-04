import type { Discovery, Interaction, Interest } from '../domain/types';
import { TAG_VOCAB } from './catalog';
import { tagReactions } from './scoring';

/** AIへ送る・保存する要約プロフィール。全履歴の代わりにこれだけを使う（コスト対策）。 */
export function buildProfileSummary(interests: Interest[], discoveries: Discovery[], interactions: Interaction[]): string {
  const top = [...interests].sort((a, b) => b.weight - a.weight).slice(0, 8).map((i) => `${i.name}(${i.weight})`);
  const { liked, disliked } = tagReactions(discoveries, interactions);
  const parts: string[] = [];
  parts.push(top.length ? `興味: ${top.join('、')}` : '興味: 未登録');
  if (liked.size) parts.push(`好反応のタグ: ${[...liked].slice(0, 6).join('、')}`);
  if (disliked.size) parts.push(`避けたいタグ: ${[...disliked].slice(0, 6).join('、')}`);
  return parts.join(' / ');
}

/** 文章に含まれる既知のテーマ語を拾う（ルールベース。外部送信なし）。 */
export function extractTags(text: string, limit = 5): string[] {
  const t = text.normalize('NFKC').toLowerCase();
  return TAG_VOCAB.filter((v) => v.length >= 2 && t.includes(v.normalize('NFKC').toLowerCase())).slice(0, limit);
}

export function inferNewInterests(text: string, existing: Interest[], limit = 3): string[] {
  const have = new Set(existing.map((i) => i.name.normalize('NFKC').toLowerCase()));
  return extractTags(text, 10).filter((tg) => !have.has(tg.normalize('NFKC').toLowerCase())).slice(0, limit);
}
