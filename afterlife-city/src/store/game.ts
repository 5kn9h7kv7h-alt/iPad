import { create } from 'zustand';
import { createWorld } from '../sim/world';
import { advance, catchUp } from '../sim/engine';
import type { SimEvent, WorldState } from '../sim/types';
import type { AiLogEntry } from '../ai/service';
import type { AiStatus } from '../ai/client';

/** The world is a plain mutable object, kept outside React state so rendering load never corrupts it. */
export const sim: { world: WorldState } = { world: createWorld() };

export type Tab = 'city' | 'people' | 'events' | 'history' | 'settings';
export type CameraMode = 'auto' | 'manual' | 'follow';
export type Speed = 0 | 1 | 2 | 5 | 10;

interface GameStore {
  rev: number;                      // bumps ~2x/second to refresh UI from sim.world
  ready: boolean;
  tab: Tab;
  speed: Speed;
  selectedCitizen: string | null;
  selectedBuilding: string | null;
  spotlight: string | null;         // 気になる住人
  cameraMode: CameraMode;
  shotLabel: string;
  aiStatus: AiStatus;
  aiEnabled: boolean;
  aiLog: AiLogEntry[];
  digest: { simulated: number; days: number; events: SimEvent[] } | null;
  toast: string | null;
  documentaryFor: string | null;
  focus: { buildingId: string; at: number } | null;
  focusBuilding: (id: string) => void;
  setTab: (t: Tab) => void;
  setSpeed: (s: Speed) => void;
  selectCitizen: (id: string | null) => void;
  selectBuilding: (id: string | null) => void;
  setSpotlight: (id: string | null) => void;
  setCameraMode: (m: CameraMode) => void;
  setShotLabel: (s: string) => void;
  setAi: (p: Partial<Pick<GameStore, 'aiStatus' | 'aiEnabled'>>) => void;
  pushAiLog: (e: AiLogEntry[]) => void;
  setDigest: (d: GameStore['digest']) => void;
  say: (msg: string) => void;
  openDocumentary: (id: string | null) => void;
  touch: () => void;
  replaceWorld: (w: WorldState, offscreenMinutes: number) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<GameStore>((set, get) => ({
  rev: 0, ready: false, tab: 'city', speed: 1, selectedCitizen: null, selectedBuilding: null, spotlight: null,
  cameraMode: 'auto', shotLabel: 'Aerial Shot', aiStatus: { enabled: false, provider: null, model: null }, aiEnabled: true,
  aiLog: [], digest: null, toast: null, documentaryFor: null, focus: null,
  focusBuilding: id => set({ focus: { buildingId: id, at: Date.now() }, tab: 'city', selectedBuilding: id, selectedCitizen: null, cameraMode: 'auto' }),
  setTab: tab => set({ tab }),
  setSpeed: speed => set({ speed }),
  selectCitizen: id => set({ selectedCitizen: id, selectedBuilding: id ? null : get().selectedBuilding }),
  selectBuilding: id => set({ selectedBuilding: id, selectedCitizen: id ? null : get().selectedCitizen }),
  setSpotlight: spotlight => set({ spotlight }),
  setCameraMode: cameraMode => set({ cameraMode }),
  setShotLabel: shotLabel => set({ shotLabel }),
  setAi: p => set(p),
  pushAiLog: e => set(s => ({ aiLog: [...e, ...s.aiLog].slice(0, 40) })),
  setDigest: digest => set({ digest }),
  say: msg => {
    set({ toast: msg });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  openDocumentary: documentaryFor => set({ documentaryFor }),
  touch: () => set(s => ({ rev: s.rev + 1 })),
  replaceWorld: (w, offscreenMinutes) => {
    sim.world = w;
    let digest: GameStore['digest'] = null;
    if (offscreenMinutes >= 30) {
      const r = catchUp(w, offscreenMinutes);
      if (r.digest.length) digest = { simulated: r.simulated, days: r.days, events: r.digest };
    }
    set({ digest, ready: true, rev: get().rev + 1, selectedCitizen: null, selectedBuilding: null, spotlight: null });
  },
}));

export function newGame(seed = Date.now() % 100000): void {
  sim.world = createWorld(seed);
  advance(sim.world, 60); // let the first morning start moving
  useGame.setState({ ready: true, digest: null, selectedCitizen: null, selectedBuilding: null, spotlight: null, rev: useGame.getState().rev + 1 });
}

/** Subscribe a component to the world; re-renders about twice a second. */
export function useWorld(): WorldState {
  useGame(s => s.rev);
  return sim.world;
}
