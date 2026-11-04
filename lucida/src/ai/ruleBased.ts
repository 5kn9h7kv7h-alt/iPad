import { CATALOG } from './catalog';
import type { DiscoveryProvider, GenerateRequest } from './provider';
import type { Candidate } from '../domain/types';

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

export function matchesKeyword(c: Candidate, keyword: string): boolean {
  const k = norm(keyword).trim();
  if (!k) return true;
  return [c.title, c.fact, c.category, ...c.tags].some((t) => norm(t).includes(k));
}

/** 同梱カタログから候補を返す。外部通信なし・費用ゼロ。選別はエンジンのスコアリングが行う。 */
export const ruleBasedProvider: DiscoveryProvider = {
  id: 'rule-based',
  metered: false,
  async generate(req: GenerateRequest) {
    const avoid = new Set(req.avoidKeys);
    return CATALOG.filter((c) =>
      !avoid.has(c.sourceKey)
      && (!req.category || c.category === req.category)
      && (!req.keyword || matchesKeyword(c, req.keyword))
      && (!req.keywords?.length || req.keywords.some((k) => matchesKeyword(c, k))));
  },
};
