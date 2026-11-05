import type { WorldState } from '../../sim/types';
import { Batch } from './batch';
import { designBuilding, designLot } from './designs';
import { designStreet } from './streets';

/** Build the shared geometry buffers for every building, lot and construction site. Pure. */
export function buildCity(w: WorldState): Batch {
  const B = new Batch();
  for (const b of Object.values(w.buildings)) if (b.status !== 'demolished') designBuilding(B, b, w);
  for (const l of w.lots) if (!l.used) designLot(B, l.x, l.z, l.w, l.d, w.construction.some(k => k.lotId === l.id), `lot:${l.id}`);
  designStreet(B, w);
  return B;
}

export function citySignature(w: WorldState): string {
  return [
    Object.values(w.buildings).map(b => `${b.id}${b.status}`).join(),
    w.lots.map(l => `${l.id}${l.used ? 1 : 0}`).join(),
    w.construction.map(k => k.lotId).join(),
    w.props.map(p => p.id).join(),
  ].join('|');
}
