import { getPrefs } from '../ai/engine';
import { extractTags, inferNewInterests } from '../ai/profile';
import type { Repository } from '../data/repository';
import { newId, nowIso } from '../domain/util';
import { getIntegration, type IntegrationId } from './index';

export interface ImportResult { added: number; duplicates: number; skipped: number; remarks: string[]; inferred: string[] }

/**
 * 連携からの取り込み。設定で明示的に許可されていない連携は実行しない。
 * 同じ項目は二度取り込まない（externalId で判定）。
 */
export async function importFromIntegration(repo: Repository, id: IntegrationId, fileText: string, now = new Date()): Promise<ImportResult> {
  const integration = getIntegration(id);
  if (!integration) throw new Error('この連携は利用できません');
  if ((await getPrefs(repo)).integrations[id] !== true) throw new Error('この連携はまだ許可されていません。先に「許可する」をオンにしてください');
  const parsed = integration.parse(fileText, now);
  const have = new Set((await repo.notes.list()).filter((n) => n.source === id).map((n) => n.externalId));
  let added = 0, duplicates = 0;
  const texts: string[] = [];
  for (const item of parsed.items) {
    if (have.has(item.externalId)) { duplicates++; continue; }
    have.add(item.externalId);
    await repo.notes.put({
      id: newId(), kind: 'log', text: item.text.slice(0, 300), tags: extractTags(item.text), createdAt: item.occurredAt,
      source: id, externalId: item.externalId, importedAt: nowIso(),
    });
    texts.push(item.text);
    added++;
  }
  // 取り込んだ記録に繰り返し出てくるテーマを、興味の「推定」として追加（最大3件。編集・削除できる）
  const inferred = added ? inferNewInterests(texts.join(' '), await repo.interests.list(), 3) : [];
  const t = nowIso();
  for (const name of inferred) await repo.interests.put({ id: newId(), name, weight: 2, origin: 'inferred', createdAt: t, updatedAt: t });
  return { added, duplicates, skipped: parsed.skipped, remarks: parsed.remarks, inferred };
}

/** その連携で取り込んだ記録をすべて削除する（許可を取り消すときに使える）。 */
export async function removeImported(repo: Repository, id: IntegrationId): Promise<number> {
  const mine = (await repo.notes.list()).filter((n) => n.source === id);
  for (const n of mine) await repo.notes.remove(n.id);
  return mine.length;
}
