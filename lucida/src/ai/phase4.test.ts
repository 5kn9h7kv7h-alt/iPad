import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createIdbRepository } from '../data/idb';
import { createMemoryRepository } from '../data/memory';
import { DEFAULT_PREFS, type Discovery, type Interaction } from '../domain/types';
import { INTEGRATIONS, getIntegration } from '../integrations';
import { parseIcs, parseIcsDate } from '../integrations/ics';
import { parseCsv, parseDateLoose, parseStudyCsv } from '../integrations/study';
import { CATALOG } from './catalog';
import { createEngine, getPrefs } from './engine';
import { effectiveTarget } from './frequency';
import type { DiscoveryProvider } from './provider';
import { categoryShares, exposureBalance } from './scoring';
import { isNearDuplicate, similarity } from './similarity';

const now = new Date(2026, 10, 10, 12);
const disc = (id: string, daysAgo: number, category: Discovery['category'] = 'Science'): Discovery => ({
  id, sourceKey: id, contentHash: id, title: `T${id}`, category, tags: [], fact: `F${id}`, reasoning: '', suggestion: '', provenance: 'bundled',
  scores: { interest: 0, novelty: 0, utility: 0, timing: 0, diversity: 0, total: 0 }, generatedFor: '2026-11-01',
  createdAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
});
const like = (id: string): Interaction => ({ id: `l${id}`, discoveryId: id, kind: 'like', createdAt: now.toISOString() });

describe('effectiveTarget（提案数の自動調整）', () => {
  const shown = Array.from({ length: 8 }, (_, i) => disc(`d${i}`, 1 + (i % 5)));
  it('記録が少ないうちは設定どおり', () => {
    expect(effectiveTarget(DEFAULT_PREFS, shown.slice(0, 3), [], now).target).toBe(3);
  });
  it('反応が多ければ1件増やす', () => {
    const r = effectiveTarget(DEFAULT_PREFS, shown, shown.slice(0, 5).map((d) => like(d.id)), now);
    expect(r.target).toBe(4);
    expect(r.reason).toContain('増やして');
  });
  it('ほとんど反応がなければ1件減らす（1件未満にはしない）', () => {
    expect(effectiveTarget(DEFAULT_PREFS, shown, [], now).target).toBe(2);
    expect(effectiveTarget({ ...DEFAULT_PREFS, dailyTarget: 1 }, shown, [], now).target).toBe(1);
  });
  it('興味なしは反応として数えない／今日の分と8日以上前は評価しない', () => {
    const dislikes = shown.map((d) => ({ ...like(d.id), kind: 'dislike' as const }));
    expect(effectiveTarget(DEFAULT_PREFS, shown, dislikes, now).target).toBe(2);
    const stale = [...Array.from({ length: 8 }, (_, i) => disc(`o${i}`, 9)), ...Array.from({ length: 8 }, (_, i) => disc(`t${i}`, 0))];
    expect(effectiveTarget(DEFAULT_PREFS, stale, [], now).shown).toBe(0);
  });
  it('fixed モードと1日の上限を守る', () => {
    const likes = shown.map((d) => like(d.id));
    expect(effectiveTarget({ ...DEFAULT_PREFS, frequencyMode: 'fixed' }, shown, likes, now).target).toBe(3);
    expect(effectiveTarget({ ...DEFAULT_PREFS, dailyTarget: 5 }, shown, likes, now).target).toBe(5);
    expect(effectiveTarget({ ...DEFAULT_PREFS, dailyLimit: 3 }, shown, likes, now).target).toBe(3);
  });
  it('エンジン: 反応がない日が続くと、開いたときの生成数が減る', async () => {
    const repo = createMemoryRepository();
    for (const d of shown) await repo.discoveries.put(d);
    const r = await createEngine({ repo, now: () => now }).ensureToday();
    expect(r?.created).toHaveLength(2);
  });
});

describe('類似重複の検出', () => {
  it('言い回しだけが違う発見を重複とみなす', () => {
    const a = { title: 'タコの心臓は三つある', fact: 'タコには全身へ血液を送る心臓が1つと、えらへ血液を送る心臓が2つある。' };
    expect(isNearDuplicate(a, { title: 'タコには心臓が三つある', fact: 'タコは、全身に血液を送る心臓1つと、えらに血液を送る心臓2つを持つ。' })).toBe(true);
    expect(isNearDuplicate(
      { title: '習慣が定着するまでの日数は人によって大きく違う', fact: 'Lallyらの研究（2010）では、新しい行動が自動的になるまでに平均66日かかった。' },
      { title: '習慣化には平均66日かかる', fact: '2010年のLallyらの研究によると、行動が自動化されるまでの平均は66日だった。' },
    )).toBe(true);
    expect(isNearDuplicate(a, { title: '空が青い理由', fact: '大気中の分子は波長の短い光ほど強く散乱させる。' })).toBe(false);
  });
  it('同じ題材でも、別の事実なら重複とみなさない', () => {
    expect(isNearDuplicate(
      { title: 'タコの心臓は三つある', fact: 'タコには、全身へ血液を送る心臓が1つと、えらへ血液を送る「えら心臓」が2つある。' },
      { title: 'タコの血は青い', fact: 'タコの血液は、銅を含むヘモシアニンというタンパク質で酸素を運ぶため、青く見える。' },
    )).toBe(false);
    expect(isNearDuplicate(
      { title: 'コーヒーの効果は、思ったより長く残る', fact: 'カフェインの半減期は成人で平均およそ5時間とされるが、個人差が大きい。' },
      { title: 'カフェインは眠気を感じにくくする', fact: 'カフェインはアデノシン受容体に結合し、眠気を感じにくくするとされる。' },
    )).toBe(false);
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity('同じ文', '同じ文')).toBe(1);
  });
  it('同梱カタログの項目どうしは誤って重複扱いしない', () => {
    for (let i = 0; i < CATALOG.length; i++) for (let j = i + 1; j < CATALOG.length; j++) {
      expect(isNearDuplicate(CATALOG[i], CATALOG[j]), `${CATALOG[i].sourceKey} vs ${CATALOG[j].sourceKey}`).toBe(false);
    }
  });
  it('エンジン: AIが既存とほぼ同じ発見を返しても保存しない', async () => {
    const repo = createMemoryRepository();
    await repo.preferences.put({ ...(await getPrefs(repo)), aiMode: 'rule' });
    const engine0 = createEngine({ repo, now: () => now });
    await engine0.generate({ count: 1, keyword: 'タコ' });
    await repo.preferences.put({ ...(await getPrefs(repo)), aiMode: 'auto' });
    const remote: DiscoveryProvider = {
      id: 'ai', metered: true,
      async generate() {
        return [
          { sourceKey: 'ai-octo', category: 'Science', tags: ['生物'], title: 'タコには心臓が三つある', fact: 'タコには、全身へ血液を送る心臓が1つと、えらへ血液を送る「えら心臓」が2つあり、合わせて3つの心臓を持っている。', reasoning: '', suggestion: '', sources: [{ title: 's', url: 'https://example.org' }], provenance: 'ai' },
          { sourceKey: 'ai-new', category: 'Science', tags: ['化学'], title: '水は4℃で最も密度が高い', fact: '水の密度は約4℃で最大になる。', reasoning: '', suggestion: '', sources: [{ title: 's', url: 'https://example.org' }], provenance: 'ai' },
        ];
      },
    };
    const r = await createEngine({ repo, remote, now: () => now }).generate({ count: 3 });
    expect(r.created.map((d) => d.sourceKey)).toEqual(['ai-new']);
  });
});

describe('分野の偏り補正', () => {
  it('よく出ている分野は低く、出ていない分野は高い', () => {
    const hist = [...Array.from({ length: 8 }, (_, i) => disc(`s${i}`, 1, 'Science')), ...Array.from({ length: 2 }, (_, i) => disc(`i${i}`, 1, 'Ideas'))];
    expect(exposureBalance('Science', hist)).toBe(0);
    expect(exposureBalance('Unknown', hist)).toBe(1);
    expect(exposureBalance('Ideas', hist)).toBeCloseTo(0.4);
    expect(exposureBalance('Science', hist.slice(0, 3))).toBe(0.5); // 履歴が少ないうちは中立
    expect(categoryShares(hist).Science).toBeCloseTo(0.8);
  });
  it('エンジン: 1分野に偏った履歴のあとは、別の分野が選ばれる', async () => {
    const repo = createMemoryRepository();
    for (let i = 0; i < 10; i++) await repo.discoveries.put({ ...disc(`h${i}`, 2 + i, 'Science'), tags: [`t${i}`] });
    const r = await createEngine({ repo, now: () => now }).generate({ count: 2 });
    expect(r.created.every((d) => d.category !== 'Science')).toBe(true);
  });
});

describe('連携: カレンダー(.ics)', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:1@x', 'DTSTART:20261105T090000Z', 'SUMMARY:歯医者\\, 定期検診', 'LOCATION:駅前', 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'DESCRIPTION:alarm', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:2@x', 'DTSTART;VALUE=DATE:20261101', 'SUMMARY:長い件名が折り返', ' されている', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:3@x', 'DTSTART;TZID=Asia/Tokyo:20261220T100000', 'SUMMARY:未来の予定', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:4@x', 'DTSTART:20261102T100000Z', 'SUMMARY:中止', 'STATUS:CANCELLED', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:5@x', 'SUMMARY:日付なし', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:6@x', 'DTSTART:20260101T100000Z', 'SUMMARY:古い予定', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  it('件名・日時・場所を読み、折り返し・エスケープ・終日・中止・VALARMを正しく扱う', () => {
    const { events, invalid } = parseIcs(ics);
    expect(events.map((e) => e.summary)).toEqual(['歯医者, 定期検診', '長い件名が折り返されている', '未来の予定', '古い予定']);
    expect(events[0]).toMatchObject({ location: '駅前', allDay: false });
    expect(events[0].start.toISOString()).toBe('2026-11-05T09:00:00.000Z');
    expect(events[1]).toMatchObject({ allDay: true, recurring: true });
    expect(invalid).toBe(1);
    expect(parseIcsDate('2026-11-05')).toBeNull();
    expect(() => parseIcs('hello')).toThrow();
  });
  it('過去90日の予定だけを取り込み対象にし、同じ予定は同じIDになる', () => {
    const cal = getIntegration('calendar')!;
    const r = cal.parse(ics, now);
    expect(r.items.map((i) => i.text)).toEqual(['予定: 歯医者, 定期検診（駅前）', '予定: 長い件名が折り返されている']);
    expect(r.remarks.join()).toContain('初回だけ');
    expect(cal.parse(ics, now).items[0].externalId).toBe(r.items[0].externalId);
    expect(cal.disclosure).toContain('外部へ送信');
  });
});

describe('連携: 学習記録(CSV)', () => {
  it('見出しつき・引用符・カンマ・BOMを扱い、不正な行を数える', () => {
    const csv = '﻿日付,科目,内容,分\n2026-11-01,数学,"微分, 積分",45\n2026/11/02,英語,長文読解,\nこれは日付ではない,x,y,1\n';
    const { rows, invalid } = parseStudyCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ text: '数学 / 微分, 積分', minutes: 45 });
    expect(rows[1].minutes).toBeUndefined();
    expect(invalid).toBe(1);
  });
  it('見出しなしは「日付, 内容, 分」とみなす', () => {
    const r = getIntegration('study')!.parse('2026-11-03,線形代数,30\n2026-11-04,確率\n', now);
    expect(r.items.map((i) => i.text)).toEqual(['学習: 確率', '学習: 線形代数（30分）']);
  });
  it('CSVと日付の細部', () => {
    expect(parseCsv('a,"b ""q"" c"\n\n1,2')).toEqual([['a', 'b "q" c'], ['1', '2']]);
    expect(parseDateLoose('2026年11月3日')?.getDate()).toBe(3);
    expect(parseDateLoose('2026-02-31')).toBeNull();
    expect(() => parseStudyCsv('')).toThrow();
    expect(() => parseStudyCsv('日付,分\n2026-11-01,3')).toThrow('内容の列');
  });
  it('どの連携も、許可前に見せる説明を持つ', () => {
    for (const i of INTEGRATIONS) expect(i.disclosure.length).toBeGreaterThan(20);
  });
});

describe('IndexedDB の版上げ (v1 → v2)', () => {
  it('v1 のデータを残したまま、新しいストアが使える', async () => {
    const name = 'upgrade-test';
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => { for (const s of ['interests', 'discoveries', 'sources', 'questions', 'interactions', 'notes', 'preferences', 'usage', 'cache']) open.result.createObjectStore(s, { keyPath: 'id' }); };
      open.onsuccess = () => {
        const tx = open.result.transaction('interests', 'readwrite');
        tx.objectStore('interests').put({ id: 'old', name: '昔の興味', weight: 3, origin: 'manual', createdAt: 'x', updatedAt: 'x' });
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
      open.onerror = () => reject(open.error);
    });
    const repo = await createIdbRepository(name);
    expect((await repo.interests.list()).map((i) => i.name)).toEqual(['昔の興味']);
    await repo.experiments.put({ id: 'e', title: 't', hypothesis: '', plan: '', startsOn: '2026-11-01', endsOn: '2026-11-02', status: 'planned', createdAt: 'x' });
    await repo.nodes.put({ id: 'free:1', type: 'topic', label: 'a', createdAt: 'x' });
    expect(await repo.experiments.list()).toHaveLength(1);
    expect(Object.keys(await repo.exportAll())).toEqual(expect.arrayContaining(['nodes', 'edges', 'experiments', 'experimentLogs']));
  });
});
