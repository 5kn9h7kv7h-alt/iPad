import { clamp, rand } from './rng';
import { hourOf, seasonOf } from './clock';
import type { Environment, Season, Weather, WorldState } from './types';

const SUNRISE: Record<Season, number> = { spring: 5.6, summer: 4.8, autumn: 5.9, winter: 6.8 };
const SUNSET: Record<Season, number> = { spring: 18.2, summer: 19.0, autumn: 17.4, winter: 16.6 };
const BASE_TEMP: Record<Season, number> = { spring: 14, summer: 26, autumn: 15, winter: 5 };

const TRANSITIONS: Record<Weather, [Weather, number][]> = {
  clear: [['clear', 0.62], ['cloudy', 0.3], ['fog', 0.06], ['rain', 0.02]],
  cloudy: [['clear', 0.3], ['cloudy', 0.36], ['rain', 0.26], ['fog', 0.08]],
  rain: [['rain', 0.4], ['cloudy', 0.45], ['clear', 0.1], ['fog', 0.05]],
  fog: [['fog', 0.3], ['clear', 0.4], ['cloudy', 0.3]],
};

export function initialEnvironment(startDate: string, t: number): Environment {
  const env: Environment = {
    weather: 'clear', nextWeatherAt: t + 180, temperature: 14, wind: 0.3, sea: 0.3,
    season: seasonOf(startDate, t), daylight: 0, lightsOn: false,
  };
  return env;
}

export function daylightAt(season: Season, hour: number): number {
  const rise = SUNRISE[season], set = SUNSET[season];
  if (hour < rise - 0.7 || hour > set + 0.7) return 0;
  if (hour < rise + 0.7) return clamp((hour - (rise - 0.7)) / 1.4, 0, 1) * 0.7;
  if (hour > set - 0.7) return clamp((set + 0.7 - hour) / 1.4, 0, 1) * 0.7;
  const mid = (rise + set) / 2;
  return 0.7 + 0.3 * Math.cos(((hour - mid) / ((set - rise) / 2)) * (Math.PI / 2));
}

export function updateEnvironment(w: WorldState): void {
  const env = w.env;
  const hour = hourOf(w.time);
  env.season = seasonOf(w.startDate, w.time);
  if (w.time >= env.nextWeatherAt) {
    const row = TRANSITIONS[env.weather];
    // winter/summer bias: more rain in autumn, more clear in summer
    let r = rand(w);
    let next: Weather = row[0][0];
    for (const [wx, p] of row) { if ((r -= p) <= 0) { next = wx; break; } }
    if (env.season === 'autumn' && next === 'clear' && rand(w) < 0.25) next = 'cloudy';
    if (next === 'fog' && hour > 11 && hour < 16) next = 'cloudy';
    env.weather = next;
    env.nextWeatherAt = w.time + 120 + Math.floor(rand(w) * 360);
    env.wind = clamp(0.15 + rand(w) * 0.5 + (next === 'rain' ? 0.2 : 0), 0, 1);
  }
  const dl = daylightAt(env.season, hour);
  env.daylight = env.weather === 'clear' ? dl : dl * (env.weather === 'fog' ? 0.75 : env.weather === 'rain' ? 0.6 : 0.82);
  const diurnal = Math.cos(((hour - 14.5) / 24) * Math.PI * 2) * 4.5;
  const wx = env.weather === 'rain' ? -2.5 : env.weather === 'cloudy' ? -1 : env.weather === 'fog' ? -1.5 : 0;
  env.temperature = Math.round((BASE_TEMP[env.season] + diurnal + wx) * 10) / 10;
  env.sea = clamp(0.18 + env.wind * 0.7 + (env.weather === 'rain' ? 0.15 : 0), 0, 1);
  env.lightsOn = dl < 0.55;
}
