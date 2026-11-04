import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { advance } from '../src/sim/engine';
import { validateProposal, applyProposals, sanitizeDialogue } from '../src/ai/validate';
import { parseProposals } from '../src/ai/schema';
import { getRel } from '../src/sim/social';
import type { AiProposal } from '../src/ai/schema';

function worldAtNoon() { const w = createWorld(); advance(w, 7 * 60); return w; }
const good = (over: Partial<AiProposal> = {}): AiProposal => ({
  type: 'meetup', title: 'カフェでお茶', detail: '久しぶりにゆっくり話す約束をした。', locationId: 'b_seacafe',
  people: ['c_11', 'c_19'], startInMinutes: 600, durationMinutes: 60, ...over,
});

describe('AI validation layer', () => {
  it('accepts a sound meetup', () => {
    const w = worldAtNoon();
    getRel(w, 'c_11', 'c_19').familiarity = 40;
    const v = validateProposal(w, good({ startInMinutes: 24 * 60 - (w.time % 1440) + 14 * 60 }));
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });
  it('rejects unknown residents', () => {
    const w = worldAtNoon();
    const v = validateProposal(w, good({ people: ['c_11', 'c_99'] }));
    expect(v).toMatchObject({ ok: false });
  });
  it('rejects unknown or closed places', () => {
    const w = worldAtNoon();
    expect(validateProposal(w, good({ locationId: 'b_nowhere' }))).toMatchObject({ ok: false });
    w.buildings['b_seacafe'].status = 'closed';
    expect(validateProposal(w, good())).toMatchObject({ ok: false });
  });
  it('rejects meetups between strangers or at night / outside opening hours', () => {
    const w = worldAtNoon();
    getRel(w, 'c_11', 'c_19').familiarity = 2;
    expect(validateProposal(w, good())).toMatchObject({ ok: false, reason: expect.stringContaining('面識') });
    getRel(w, 'c_11', 'c_19').familiarity = 50;
    expect(validateProposal(w, good({ startInMinutes: 60 * 14 }))).toMatchObject({ ok: false });
  });
  it('rejects time paradoxes', () => {
    const w = worldAtNoon();
    getRel(w, 'c_11', 'c_19').familiarity = 50;
    expect(validateProposal(w, good({ startInMinutes: -30 }))).toMatchObject({ ok: false });
    expect(validateProposal(w, good({ startInMinutes: 99999 }))).toMatchObject({ ok: false });
  });
  it('rejects text that drags in uninvolved residents', () => {
    const w = worldAtNoon();
    getRel(w, 'c_11', 'c_19').familiarity = 50;
    const v = validateProposal(w, good({ detail: '佐藤 健一も誘って話す。' }));
    expect(v).toMatchObject({ ok: false });
  });
  it('rejects duplicates', () => {
    const w = worldAtNoon();
    getRel(w, 'c_11', 'c_19').familiarity = 50;
    const p = good({ startInMinutes: 24 * 60 - (w.time % 1440) + 14 * 60 });
    const first = applyProposals(w, [p]);
    expect(first[0].ok, first[0].reason).toBe(true);
    expect(applyProposals(w, [p])[0].ok).toBe(false);
  });
  it('rejects hobbies that are unknown or already owned', () => {
    const w = worldAtNoon();
    expect(validateProposal(w, { type: 'hobby', title: '新しい趣味', detail: 'はじめた。', people: ['c_01'], param: 'スカイダイビング' })).toMatchObject({ ok: false });
    expect(validateProposal(w, { type: 'hobby', title: '新しい趣味', detail: 'はじめた。', people: ['c_01'], param: w.citizens['c_01'].interests[0] })).toMatchObject({ ok: false });
  });
  it('parses garbage defensively', () => {
    expect(parseProposals(null)).toEqual([]);
    expect(parseProposals({ proposals: [{ nope: 1 }, 5, null] })).toEqual([]);
  });
  it('sanitises dialogue', () => {
    expect(sanitizeDialogue([{ speakerId: 'c_01', text: 'こんにちは' }, { speakerId: 'c_02', text: 'どうも' }], 'c_01', 'c_02')).toHaveLength(2);
    expect(sanitizeDialogue([{ speakerId: 'c_09', text: 'x' }, { speakerId: 'c_02', text: 'y' }], 'c_01', 'c_02')).toBeNull();
  });
  it('a validated meetup actually happens in the simulation', () => {
    const w = createWorld(5); advance(w, 8 * 60);
    getRel(w, 'c_11', 'c_19').familiarity = 50;
    // tomorrow 15:00 at the seaside cafe, both are on shop/late shifts: use weekend-proof choice by trying several days
    let placed = false;
    for (let d = 0; d < 6 && !placed; d++) {
      const p = good({ title: `お茶${d}`, startInMinutes: (d + 1) * 1440 - (w.time % 1440) + 15 * 60 });
      placed = applyProposals(w, [p])[0].ok;
    }
    expect(placed).toBe(true);
    advance(w, 7 * 1440);
    expect(w.events.some(e => e.source === 'ai')).toBe(true);
  });
});
