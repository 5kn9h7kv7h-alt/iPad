import type { Building, RoadNode, WorldState } from './types';

const cache = new Map<string, string[]>();

function bfs(nodes: Record<string, RoadNode>, from: string, to: string): string[] {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of nodes[cur].links) {
      if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
    }
  }
  if (!prev.has(to)) return [from, to];
  const out: string[] = [];
  for (let c: string | undefined = to; c; c = prev.get(c)) out.push(c);
  return out.reverse();
}

export function nodePath(w: WorldState, from: string, to: string): string[] {
  const key = from + '>' + to;
  let p = cache.get(key);
  if (!p) { p = bfs(w.nodes, from, to); cache.set(key, p); }
  return p;
}

export function nearestNode(w: WorldState, x: number, z: number): RoadNode {
  let best: RoadNode | null = null, bd = Infinity;
  for (const n of Object.values(w.nodes)) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best!;
}

/** A spot to stand at inside/near a building (random inside outdoor places). */
export function spotFor(b: Building, jx: number, jz: number): { x: number; z: number } {
  const outdoor = isOutdoor(b);
  if (!outdoor) return { x: b.x, z: b.z };
  return { x: b.x + (jx - 0.5) * (b.w - 1), z: b.z + (jz - 0.5) * (b.d - 1) };
}

export const OUTDOOR_KINDS = new Set(['plaza', 'park', 'beach', 'lookout']);
export const isOutdoor = (b: Building) => OUTDOOR_KINDS.has(b.kind);

/** Waypoints from the citizen's current position to the destination building. */
export function routeTo(
  w: WorldState, fromX: number, fromZ: number, fromBuilding: Building | null, to: Building, jx: number, jz: number,
): { x: number; z: number }[] {
  const startNode = fromBuilding ? w.nodes[fromBuilding.nodeId] : nearestNode(w, fromX, fromZ);
  const ids = nodePath(w, startNode.id, to.nodeId);
  const pts = ids.map(id => ({ x: w.nodes[id].x, z: w.nodes[id].z }));
  pts.push(spotFor(to, jx, jz));
  return pts;
}
