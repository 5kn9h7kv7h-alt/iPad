// Where a building's front door is. Shared by the simulation (routes) and the renderer (door meshes),
// so residents always step out of the door that is actually drawn.
import type { Building, BuildingKind, WorldState } from './types';

/** Which local side faces the street the building is attached to (local front = +z). */
export function frontYaw(b: Building, w: WorldState): number {
  const n = w.nodes[b.nodeId];
  if (!n) return 0;
  const dx = n.x - b.x, dz = n.z - b.z;
  if (Math.abs(dz) >= Math.abs(dx)) return dz >= 0 ? 0 : Math.PI;
  return dx > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Door position along the front face, as a fraction of the facade width. */
export const DOOR_X: Partial<Record<BuildingKind, number>> = {
  shop: 0.32, house: -0.2, apartment: 0, cafe: 0.34, bookstore: 0.28, restaurant: 0, office: 0.37,
  convenience: 0.35, warehouse: 0, fishery: 0, station: 0, tourist: 0, market: 0,
};

/** Local facade frame: width W along local x, depth D along local z (footprint unchanged in world space). */
export function facade(b: Building, w: WorldState): { yaw: number; W: number; D: number } {
  const yaw = frontYaw(b, w);
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  return { yaw, W: swap ? b.d : b.w, D: swap ? b.w : b.d };
}

export function localToWorld(b: Building, yaw: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c };
}

/** A point on the street side, just outside the front door. */
export function doorPoint(b: Building, w: WorldState, out = 0.9): { x: number; z: number } {
  const { yaw, W, D } = facade(b, w);
  return localToWorld(b, yaw, (DOOR_X[b.kind] ?? 0) * W, D / 2 + out);
}
