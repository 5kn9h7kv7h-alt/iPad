import { describe, expect, it } from 'vitest';
import { buildPrompt, parseModelOutput, parseRequest, pickModel } from './logic.ts';

const models = { light: 'L', heavy: 'H' };
describe('generate-discovery logic', () => {
  it('入力を正規化し、件数と長さを制限する', () => {
    const r = parseRequest({ profileSummary: 'x'.repeat(5000), interests: Array.from({ length: 50 }, (_, i) => ({ name: `n${i}`, weight: 99 })), avoidKeys: [], count: 99, category: 'Bogus' });
    expect(r.profileSummary.length).toBe(600);
    expect(r.interests).toHaveLength(12);
    expect(r.interests[0].weight).toBe(5);
    expect(r.count).toBe(5);
    expect(r.category).toBeUndefined();
    expect(() => parseRequest(null)).toThrow();
  });
  it('Web検索は true が明示されたときだけ有効', () => {
    expect(parseRequest({ count: 1, allowWebSearch: 'true' }).allowWebSearch).toBe(false);
    expect(parseRequest({ count: 1, allowWebSearch: true }).allowWebSearch).toBe(true);
  });
  it('モデルは複雑さで使い分ける', () => {
    expect(pickModel(parseRequest({ count: 1 }), models).tier).toBe('light');
    expect(pickModel(parseRequest({ count: 1, keyword: '睡眠' }), models).tier).toBe('heavy');
    expect(pickModel(parseRequest({ count: 1, allowWebSearch: true }), models).model).toBe('H');
  });
  it('プロンプトに事実/推測の区別と検索可否が入る', () => {
    const off = buildPrompt(parseRequest({ count: 2 }));
    expect(off.system).toContain('推測');
    expect(off.user).toContain('Web検索は使えません');
    expect(buildPrompt(parseRequest({ count: 2, allowWebSearch: true })).user).toContain('Web検索を使って');
  });
  it('出力から候補を取り出し、出典のないもの・http・不正カテゴリは捨てる', () => {
    const good = { sourceKey: 'a', category: 'Science', tags: ['t'], title: 'T', fact: 'F', reasoning: 'R', suggestion: 'S', sources: [{ title: 'x', url: 'https://example.org' }] };
    const text = '説明\n' + JSON.stringify({ candidates: [good, { ...good, sources: [] }, { ...good, sources: [{ title: 'x', url: 'http://insecure' }] }, { ...good, category: 'Nope' }] });
    const out = parseModelOutput(text);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('T');
    expect(() => parseModelOutput('no json')).toThrow();
  });
});
