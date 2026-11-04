// SMALL INTERVENTION: the player may add facilities; residents react on their own. Nothing forces behaviour.
import { logEvent } from './log';
import { queueConstruction, scheduleFestival } from './happenings';
import { isOutdoor } from './paths';
import type { BuildingKind, Prop, WorldState } from './types';

export type PropKind = Prop['kind'];
export const PROP_LABEL: Record<PropKind, string> = { bench: 'ベンチ', plant: '植物', streetlight: '街灯', playground: '公園設備' };
const LIMIT: Record<PropKind, number> = { bench: 6, plant: 10, streetlight: 6, playground: 3 };

export function placeProp(w: WorldState, buildingId: string, kind: PropKind): { ok: boolean; message: string } {
  const b = w.buildings[buildingId];
  if (!b || b.status !== 'open') return { ok: false, message: '設置場所が見つかりません' };
  if (!isOutdoor(b) && b.kind !== 'cafe') return { ok: false, message: 'この場所には設置できません（公園・広場・海岸・展望台が対象）' };
  if (kind === 'playground' && b.kind !== 'park') return { ok: false, message: '公園設備は公園にのみ設置できます' };
  const count = w.props.filter(p => p.buildingId === b.id && p.kind === kind).length;
  if (count >= LIMIT[kind]) return { ok: false, message: `${b.name}の${PROP_LABEL[kind]}はこれ以上増やせません` };
  const id = `p_${++w.counters.prop}`;
  const jitterX = ((w.counters.prop * 37) % 100) / 100, jitterZ = ((w.counters.prop * 61) % 100) / 100;
  w.props.push({ id, kind, buildingId: b.id, x: b.x + (jitterX - 0.5) * (b.w - 1), z: b.z + (jitterZ - 0.5) * Math.max(1, b.d - 1), placedAt: w.time });
  logEvent(w, {
    category: 'environment', locationId: b.id, importance: 30, source: 'player', historic: true,
    summary: `${b.name}に${PROP_LABEL[kind]}が設置された`, cause: '観察者による小さな手入れ',
    result: kind === 'bench' ? '休憩したり話したりする人が増えるかもしれない' : kind === 'streetlight' ? '夜の人通りが変わるかもしれない' : '街の風景が少し変わった',
  });
  return { ok: true, message: `${b.name}に${PROP_LABEL[kind]}を設置しました` };
}

export function proposeShop(w: WorldState, lotId: string, kind: BuildingKind): { ok: boolean; message: string } {
  const err = queueConstruction(w, lotId, kind, 'player');
  return err ? { ok: false, message: err } : { ok: true, message: '建設候補を追加しました（約3日後に開業）' };
}

export function holdFestival(w: WorldState, buildingId: string): { ok: boolean; message: string } {
  const b = w.buildings[buildingId];
  if (!b || b.status !== 'open') return { ok: false, message: '会場が見つかりません' };
  const names: Record<string, string> = { spring: '春まつり', summer: '夏まつり', autumn: '秋まつり', winter: '冬のあかりまつり' };
  const s = scheduleFestival(w, b.id, names[w.env.season], '観察者の呼びかけで開かれる季節のお祭り。', 17 * 60, 150, 'player');
  if (!s) return { ok: false, message: '近い日程ですでにお祭りが予定されています' };
  return { ok: true, message: `${b.name}で${names[w.env.season]}が開かれます` };
}
