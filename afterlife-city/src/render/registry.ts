// Read-only handles the debug/e2e layer may use. The renderer publishes into it; nothing flows back into the simulation.
import type { PerspectiveCamera } from 'three';

export interface FrameStats { drawCalls: number; triangles: number; geometries: number; textures: number }
export const registry: {
  camera: PerspectiveCamera | null;
  look: { x: number; y: number; z: number } | null;
  stats: FrameStats;
  /** seconds (performance.now()/1000) of the last manual camera interaction; debug may set it in the future to hold a pose */
  lastInteract: number;
} = { camera: null, look: null, stats: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 }, lastInteract: -999 };
