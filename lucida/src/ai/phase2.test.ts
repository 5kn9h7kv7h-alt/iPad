import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../data/memory';
import type { Discovery } from '../domain/types';
import { parseHttpUrl } from '../domain/util';
import { crossFieldPairs } from './crossField';
import { createEngine, getPrefs } from './engine';
import type { DiscoveryProvider, GenerateRequest } from './provider';

const noon = new Date(2026, 10, 4, 12);
const disc = (id: string, category: Discovery['category'], tags: string[], at = '2026-11-01T00:00:00Z'): Discovery => ({
  id, sourceKey: id, contentHash: id, title: `T-${id}`, category, tags, fact: 'f', reasoning: 'r', suggestion: 's', provenance: 'bundled',
  scores: { interest: 0, novelty: 0, utility: 0, timing: 0, diversity: 0, total: 0 }, generatedFor: '2026-11-01', createdAt: at,
});

describe('crossFieldPairs', () => {
  it('カテゴリが違い、共通タグがある組だけを返し、同じ発見を重複して使わない', () => {
    const ds = [disc('a', 'Science', ['宇宙', '物理']), disc('b', 'Technology', ['宇宙', '物理']), disc('c', 'Ideas', ['宇宙']), disc('d', 'Science', ['宇宙'])];
    const pairs = crossFieldPairs(ds, 5);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) { expect(p.a.category).not.toBe(p.b.category); expect(p.bridge.length).toBeGreaterThan(0); expect(p.text).toContain('推測'); }
    const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pairs[0].bridge).toEqual(['宇宙', '物理']);
  });
  it('共通タグがなければ空', () => {
    expect(crossFieldPairs([disc('a', 'Science', ['x']), disc('b', 'Ideas', ['y'])])).toEqual([]);
  });
});

describe('web search permission', () => {
  const spy = () => {
    const reqs: GenerateRequest[] = [];
    const remote: DiscoveryProvider = {
      id: 'spy', metered: true,
      async generate(req) {
        reqs.push(req);
        return [{ sourceKey: `k${reqs.length}`, category: 'Science', tags: ['t'], title: `題${reqs.length}`, fact: 'f', reasoning: 'r', suggestion: 's', sources: [{ title: 's', url: 'https://example.org' }], provenance: 'ai' }];
      },
    };
    return { reqs, remote };
  };
  it('既定(未許可)ではweb=trueでも検索は許可されない', async () => {
    const repo = createMemoryRepository(); const { reqs, remote } = spy();
    await createEngine({ repo, remote, now: () => noon }).generate({ count: 1, keyword: 'x', web: true });
    expect(reqs[0].allowWebSearch).toBe(false);
  });
  it('許可済みでも、手動探索(web=true)のときだけ検索を許可。Homeの自動生成では使わない', async () => {
    const repo = createMemoryRepository(); const { reqs, remote } = spy();
    await repo.preferences.put({ ...(await getPrefs(repo)), webSearch: true });
    const engine = createEngine({ repo, remote, now: () => noon });
    await engine.generate({ count: 1, keyword: 'x', web: true });
    expect(reqs[0].allowWebSearch).toBe(true);
    await engine.ensureToday();
    expect(reqs[reqs.length - 1].allowWebSearch).toBe(false);
  });
  it('AI由来の出典は origin=ai で、取得日時が記録される', async () => {
    const repo = createMemoryRepository(); const { remote } = spy();
    const r = await createEngine({ repo, remote, now: () => noon }).generate({ count: 1 });
    const src = (await repo.sources.list()).find((s) => s.discoveryId === r.created[0].id)!;
    expect(src.origin).toBe('ai');
    expect(Date.parse(src.fetchedAt)).toBeGreaterThan(0);
  });
});

describe('keywords / source url', () => {
  it('keywords はいずれかに合致する発見だけを返す', async () => {
    const repo = createMemoryRepository();
    const r = await createEngine({ repo, now: () => noon }).generate({ count: 10, keywords: ['睡眠', '宇宙'] });
    expect(r.created.length).toBeGreaterThan(1);
    expect(r.created.every((d) => d.tags.some((t) => ['睡眠', '宇宙'].includes(t)) || /睡眠|宇宙/.test(d.title + d.fact))).toBe(true);
  });
  it('出典URLは http(s) のみ受け付ける', () => {
    expect(parseHttpUrl('https://example.org/a')).toBe('https://example.org/a');
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpUrl('data:text/html,x')).toBeNull();
    expect(parseHttpUrl('not a url')).toBeNull();
  });
});
