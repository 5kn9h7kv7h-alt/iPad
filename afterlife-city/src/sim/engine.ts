// Simulation engine: advances the world by sim-minutes. Pure TypeScript, no rendering, no AI.
import { dayOf } from './clock';
import { updateEnvironment } from './environment';
import { stepCitizen } from './behavior';
import { socialize } from './social';
import { daily, hourly, processScheduled } from './happenings';
import { logEvent } from './log';
import { MINUTES_PER_DAY, WEATHER_LABEL, type SimEvent, type WorldState } from './types';

const WEATHER_TEXT: Record<string, string> = {
  clear: '空が晴れ渡った', cloudy: '空に雲が広がってきた', rain: '雨が降り始めた', fog: '港に霧が立ちこめてきた',
};

export function step(w: WorldState): void {
  const prevWeather = w.env.weather;
  w.time += 1;
  updateEnvironment(w);
  if (w.env.weather !== prevWeather) {
    logEvent(w, {
      category: 'environment', importance: w.env.weather === 'rain' || w.env.weather === 'fog' ? 6 : 3,
      summary: WEATHER_TEXT[w.env.weather], cause: `天候が${WEATHER_LABEL[prevWeather]}から${WEATHER_LABEL[w.env.weather]}に変わった`, result: '',
    });
  }
  if (w.time % 60 === 0) hourly(w);
  if (w.time % MINUTES_PER_DAY === 0) daily(w);
  processScheduled(w);
  for (const id in w.citizens) stepCitizen(w, w.citizens[id]);
  if (w.time % 3 === 0) socialize(w);
}

export function advance(w: WorldState, minutes: number): void {
  for (let i = 0; i < minutes; i++) step(w);
}

export const MAX_OFFSCREEN_MINUTES = 7 * MINUTES_PER_DAY;

/** OFFSCREEN LIFE: simulate elapsed real time (capped), return a digest of what mattered. */
export function catchUp(w: WorldState, minutes: number): { simulated: number; digest: SimEvent[]; days: number } {
  const n = Math.max(0, Math.min(Math.floor(minutes), MAX_OFFSCREEN_MINUTES));
  const from = w.time;
  const firstEvent = w.counters.event;
  advance(w, n);
  const digest = w.events
    .filter(e => e.time > from && Number(e.id.slice(2)) > firstEvent && (e.historic || e.importance >= 30))
    .sort((a, b) => b.importance - a.importance || a.time - b.time)
    .slice(0, 14)
    .sort((a, b) => a.time - b.time);
  return { simulated: n, digest, days: dayOf(w.time) - dayOf(from) };
}
