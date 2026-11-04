// VALIDATION LAYER — the six checks from the spec (5.2). Only validated proposals reach the simulation.
import { dateOf, dayOf, minuteOfDay } from '../sim/clock';
import { INTERESTS } from '../sim/world';
import { inSleepWindow, isOpenAt } from '../sim/behavior';
import { makeScheduled } from '../sim/happenings';
import { getRel } from '../sim/social';
import type { ScheduledEvent, WorldState } from '../sim/types';
import type { AiProposal } from './schema';

export type Verdict = { ok: true; scheduled: ScheduledEvent } | { ok: false; reason: string };
const fail = (reason: string): Verdict => ({ ok: false, reason });

const MEETUP_KINDS = new Set(['cafe', 'restaurant', 'park', 'plaza', 'beach', 'lookout', 'bookstore', 'shop', 'market', 'tourist']);
const FESTIVAL_KINDS = new Set(['plaza', 'park', 'beach', 'market']);

export function proposalKey(p: AiProposal): string {
  return [p.type, p.locationId ?? '-', [...(p.people ?? [])].sort().join('+'), p.param ?? ''].join(':');
}

export function validateProposal(w: WorldState, p: AiProposal): Verdict {
  if (!['meetup', 'festival', 'rumor', 'hobby'].includes(p.type)) return fail('未対応のイベント種別');
  if (!p.title || p.title.length > 40 || !p.detail || p.detail.length > 140) return fail('文章の長さが不正');

  // 1. residents exist (and still live here); no duplicates
  const people = [...new Set(p.people ?? [])];
  for (const id of people) {
    const c = w.citizens[id];
    if (!c) return fail(`存在しない住人: ${id}`);
    if (c.movedOutAt !== undefined) return fail(`すでに街を去った住人: ${c.name}`);
  }
  const need: Record<string, [number, number]> = { meetup: [2, 2], festival: [0, 0], rumor: [1, 3], hobby: [1, 1] };
  const [lo, hi] = need[p.type];
  if (people.length < lo || people.length > hi) return fail(`住人数が不正（${people.length}）`);

  // text may not drag in residents that are not in `people`
  const text = `${p.title}${p.detail}${p.cause ?? ''}`;
  for (const c of Object.values(w.citizens)) {
    if (!people.includes(c.id) && (text.includes(c.name) || text.includes(c.name.replace(' ', '')))) return fail(`関係者に含まれない住人への言及: ${c.name}`);
  }

  // 2. location exists
  const loc = p.locationId ? w.buildings[p.locationId] : null;
  if (p.type === 'meetup' || p.type === 'festival') {
    if (!loc) return fail('存在しない場所');
    if (loc.status !== 'open') return fail('営業していない場所');
  } else if (p.locationId && !loc) return fail('存在しない場所');

  // 4. temporal sanity
  const startIn = Math.round(p.startInMinutes ?? 120);
  const dur = Math.round(p.durationMinutes ?? (p.type === 'festival' ? 150 : 60));
  if (p.type === 'meetup' || p.type === 'festival') {
    if (startIn < 60 || startIn > 48 * 60) return fail('開始時刻が範囲外（1〜48時間後）');
    if (dur < 20 || dur > 240) return fail('所要時間が範囲外');
  }
  const startAt = w.time + (p.type === 'meetup' || p.type === 'festival' ? startIn : 30);
  const endAt = startAt + dur;

  // 3. preconditions
  if (p.type === 'meetup') {
    const [a, b] = people;
    const rel = getRel(w, a, b);
    if (rel.familiarity < 10) return fail('面識が足りず約束できない');
    if (rel.tension >= 60) return fail('対立が強く、自分から会う関係ではない');
    if (!MEETUP_KINDS.has(loc!.kind)) return fail('待ち合わせに向かない場所');
    if (!isOpenAt(loc!, startAt, 0) || !isOpenAt(loc!, endAt - 1, 0)) return fail('その時間は場所が開いていない');
    for (const id of people) {
      const c = w.citizens[id];
      const h = minuteOfDay(startAt);
      if (inSleepWindow(c, h) || inSleepWindow(c, minuteOfDay(endAt))) return fail(`${c.name}の睡眠時間と重なる`);
      const wd = dateOf(w.startDate, startAt).getUTCDay();
      if (c.workplaceId && h >= c.dailyRoutine.workStart && h < c.dailyRoutine.workEnd && !c.offDays.includes(wd)) return fail(`${c.name}の勤務時間と重なる`);
    }
  }
  if (p.type === 'festival') {
    if (!FESTIVAL_KINDS.has(loc!.kind)) return fail('祭りに向かない場所');
    const h = minuteOfDay(startAt) / 60;
    if (h < 10 || h > 20) return fail('祭りの時間帯が不適切');
    if (w.scheduled.some(s => s.type === 'festival' && !s.done && Math.abs(s.startAt - startAt) < 2 * 1440)) return fail('近い日程に別の祭りがある');
  }
  if (p.type === 'hobby') {
    if (!p.param || !(INTERESTS as readonly string[]).includes(p.param)) return fail('未知の趣味');
    if (w.citizens[people[0]].interests.includes(p.param)) return fail('すでに持っている趣味');
    if (w.citizens[people[0]].interests.length >= 6) return fail('趣味の数が上限');
  }

  // 5. consistency with established facts: no overlapping commitments for the same person
  for (const s of w.scheduled) {
    if (s.done || s.type === 'rumor' || s.type === 'hobby') continue;
    if (people.some(id => s.people.includes(id)) && startAt < s.endAt && endAt > s.startAt) return fail('同じ住人の予定と重なる');
  }

  // 6. no duplicates / no repeating the same story
  const key = proposalKey(p);
  const dayKey = `${key}:d${dayOf(startAt)}`;
  if (w.usedKeys.includes(key) || w.usedKeys.includes(dayKey)) return fail('同じ出来事をすでに生成済み');
  if (w.scheduled.some(s => !s.done && s.type === p.type && s.locationId === (p.locationId ?? null) && people.every(id => s.people.includes(id)) && Math.abs(s.startAt - startAt) < 1440)) return fail('重複する予定');
  if (w.events.slice(-60).some(e => e.summary === p.title)) return fail('直近の出来事と同じ');

  return {
    ok: true,
    scheduled: makeScheduled(w, {
      type: p.type, startAt, endAt, locationId: loc?.id ?? null, people, title: p.title, detail: p.detail, source: 'ai', param: p.param,
    }),
  };
}

/** Validate a batch and apply the accepted ones. Returns per-proposal outcome for logging/UI. */
export function applyProposals(w: WorldState, proposals: AiProposal[]): { proposal: AiProposal; ok: boolean; reason?: string }[] {
  return proposals.map(p => {
    const v = validateProposal(w, p);
    if (!v.ok) return { proposal: p, ok: false, reason: v.reason };
    w.scheduled.push(v.scheduled);
    w.usedKeys.push(proposalKey(p));
    return { proposal: p, ok: true };
  });
}

/** Dialogue from AI: keep only lines spoken by the two participants, trimmed. */
export function sanitizeDialogue(raw: unknown, aId: string, bId: string): { speakerId: string; text: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out: { speakerId: string; text: string }[] = [];
  for (const l of raw.slice(0, 6)) {
    if (!l || typeof l !== 'object') return null;
    const o = l as { speakerId?: unknown; speaker?: unknown; text?: unknown };
    const sp = (o.speakerId ?? o.speaker) as string;
    if (sp !== aId && sp !== bId) return null;
    if (typeof o.text !== 'string' || !o.text.trim() || o.text.length > 90) return null;
    out.push({ speakerId: sp, text: o.text.trim() });
  }
  return out.length >= 2 ? out : null;
}
