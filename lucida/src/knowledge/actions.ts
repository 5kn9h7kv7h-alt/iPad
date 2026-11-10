import type { Repository } from '../data/repository';
import type { KnowledgeEdge, KnowledgeNode, NodeType } from '../domain/types';
import { newId, nowIso } from '../domain/util';
import { isFreeNode, nodeId, pairKey } from './graph';

/** ノードの保存レコードと、それにつながるエッジを消す（元の興味・疑問などを削除したときの後始末にも使う）。 */
export async function removeNodeData(repo: Repository, id: string): Promise<void> {
  await repo.nodes.remove(id);
  for (const e of await repo.edges.list()) if (e.sourceNode === id || e.targetNode === id) await repo.edges.remove(e.id);
}

export interface PositionInput { id: string; type: NodeType; label: string; refId?: string; x: number; y: number }

/** 位置を保存する。導出ノードにもレコードを作るが、非表示・明示追加などの既存の値は保つ。 */
export async function savePositions(repo: Repository, items: PositionInput[]): Promise<void> {
  if (items.length === 0) return;
  const existing = new Map((await repo.nodes.list()).map((n) => [n.id, n]));
  for (const it of items) {
    const prev = existing.get(it.id);
    await repo.nodes.put({
      ...(prev ?? { id: it.id, type: it.type, createdAt: nowIso() }),
      label: prev && isFreeNode(it.id) ? prev.label : it.label, refId: it.refId ?? prev?.refId,
      x: Math.round(it.x), y: Math.round(it.y),
    } as KnowledgeNode);
  }
}

/** 位置をすべて忘れて、自動配置をやり直せるようにする。 */
export async function resetLayout(repo: Repository): Promise<void> {
  for (const n of await repo.nodes.list()) {
    if (n.x === undefined && n.y === undefined) continue;
    await repo.nodes.put({ ...n, x: undefined, y: undefined });
  }
}

const FREE_TYPES: NodeType[] = ['topic', 'question', 'insight'];

export async function addFreeNode(repo: Repository, input: { type: NodeType; label: string; note?: string; x?: number; y?: number }): Promise<string> {
  const label = input.label.trim();
  if (!label) throw new Error('ノードの名前を入力してください');
  if (!FREE_TYPES.includes(input.type)) throw new Error('この種類のノードは、元になる記録から作られます');
  const id = `free:${newId()}`;
  await repo.nodes.put({ id, type: input.type, label: label.slice(0, 80), note: input.note?.trim().slice(0, 500) || undefined, x: input.x, y: input.y, createdAt: nowIso() });
  return id;
}

/**
 * Networkから外す。自由ノードは削除（つながりも消える）。
 * 興味・発見などから導かれたノードは「非表示」にする（元のデータは消さない。あとで戻せる）。
 */
export async function hideNode(repo: Repository, node: { id: string; type: NodeType; label: string; refId?: string }): Promise<void> {
  if (isFreeNode(node.id)) { await removeNodeData(repo, node.id); return; }
  const prev = await repo.nodes.get(node.id);
  await repo.nodes.put({ ...(prev ?? { id: node.id, type: node.type, label: node.label, refId: node.refId, createdAt: nowIso() }), hidden: true, pinned: false });
}

export async function restoreHidden(repo: Repository): Promise<number> {
  const hidden = (await repo.nodes.list()).filter((n) => n.hidden);
  for (const n of hidden) await repo.nodes.put({ ...n, hidden: false });
  return hidden.length;
}

/** 自動では載らない項目（評価していない発見、日常の記録など）を、明示的にNetworkへ追加する。 */
export async function pinNode(repo: Repository, type: NodeType, refId: string, label: string): Promise<string> {
  const id = nodeId(type, refId);
  const prev = await repo.nodes.get(id);
  await repo.nodes.put({ ...(prev ?? { id, type, label, refId, createdAt: nowIso() }), label, pinned: true, hidden: false });
  return id;
}

export interface EdgeInput { source: string; target: string; relation: string; origin: KnowledgeEdge['origin'] }

/** エッジを結ぶ。同じ組は1本だけ。却下済みの候補を自分で結び直した場合は、その記録を有効に戻す。 */
export async function addEdge(repo: Repository, input: EdgeInput): Promise<KnowledgeEdge> {
  if (input.source === input.target) throw new Error('同じノードどうしは結べません');
  const key = pairKey(input.source, input.target);
  const prev = (await repo.edges.list()).find((e) => pairKey(e.sourceNode, e.targetNode) === key);
  if (prev?.status === 'active') throw new Error('この2つは、すでにつながっています');
  const edge: KnowledgeEdge = {
    id: prev?.id ?? newId(), sourceNode: input.source, targetNode: input.target,
    relation: input.relation.trim().slice(0, 40) || '関連', origin: input.origin, status: 'active', createdAt: nowIso(),
  };
  await repo.edges.put(edge);
  return edge;
}

export const removeEdge = (repo: Repository, id: string) => repo.edges.remove(id);

/** 関連づけ候補を却下する。記録を残して、同じ候補を二度と出さない。 */
export async function dismissSuggestion(repo: Repository, s: { sourceNode: string; targetNode: string; relation: string }): Promise<void> {
  const key = pairKey(s.sourceNode, s.targetNode);
  if ((await repo.edges.list()).some((e) => pairKey(e.sourceNode, e.targetNode) === key)) return;
  await repo.edges.put({ id: newId(), sourceNode: s.sourceNode, targetNode: s.targetNode, relation: s.relation, origin: 'ai', status: 'dismissed', createdAt: nowIso() });
}
