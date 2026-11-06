// Test/diagnostic harness, loaded only with ?debug. It is the ONLY place allowed to poke the simulation clock.
import { sim, useGame } from './store/game';
import { registry } from './render/registry';
import { renderPos } from './render/citizens/Citizens';

export function installDebug(): void {
  const hash = () => {
    const w = sim.world;
    let h = 2166136261;
    const s = JSON.stringify([w.time, w.rngState, Object.values(w.citizens).map(c => [c.x.toFixed(2), c.z.toFixed(2), c.activity, c.currentLocation]), w.events.length, Object.keys(w.relationships).length]);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  (window as unknown as Record<string, unknown>).__afterlife = {
    sim, registry, hash,
    /** rendered (interpolated) positions of visible residents */
    positions: () => [...renderPos.entries()].filter(([, r]) => r.visible).map(([id, r]) => ({ id, x: r.x + r.ox, z: r.z + r.oz })),
    counts: () => ({
      citizens: Object.values(sim.world.citizens).filter(c => c.movedOutAt === undefined).length,
      buildings: Object.values(sim.world.buildings).filter(b => b.status !== 'demolished').length,
      areas: new Set(Object.values(sim.world.buildings).map(b => b.area)).size,
    }),
    /** Jump the clock to a given hour with fixed weather (used for reproducible screenshots). */
    setTime(hour: number, weather: 'clear' | 'cloudy' | 'rain' | 'fog' = 'clear') {
      const w = sim.world;
      w.time = Math.floor(w.time / 1440) * 1440 + Math.round(hour * 60);
      w.env.weather = weather; w.env.nextWeatherAt = w.time + 100000;
    },
    /** Jump to day N of the calendar (changes season) keeping the time of day. */
    setDay(day: number) { const w = sim.world; w.time = day * 1440 + (w.time % 1440); },
    setCamera(pos: [number, number, number], look: [number, number, number]) {
      useGame.getState().setCameraMode('manual');
      registry.lastInteract = performance.now() / 1000 + 3600; // hold the pose
      const c = registry.camera!;
      c.position.set(...pos); c.lookAt(...look);
      registry.look?.x !== undefined && Object.assign(registry.look, { x: look[0], y: look[1], z: look[2] });
      registry.controls?.target.set(...look); registry.controls?.update();
    },
  };
}
