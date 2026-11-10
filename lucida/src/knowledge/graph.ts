import { extractTags } from '../ai/profile';
import { matchesInterest } from '../ai/scoring';
import { deriveStates } from '../domain/state';
import type {
  Discovery, Experiment, Interaction, Interest, KnowledgeEdge, KnowledgeNode, NodeType, Note, Question,
} from '../domain/types';

/** 興味・発見などから導かれるノードのID。保存レコード（位置・非表示）も同じIDを使う。 */
export const nodeId = (type: NodeType, refId: string) => `${type}:${refId}`;
export const isFreeNode = (id: string) => id.startsWith('free:');
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** 詳細表示用の本文 */
  detail: string;
  /** 関連づけ候補の計算に使う全文 */
  text: string;
  tags: string[];
  refId?: string;
  free: boolean;
  x?: number;
  y?: number;
}
export interface GraphEdge { id: string; source: string; target: string; relation: string; origin: KnowledgeEdge['origin'] }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[]; hiddenCount: number }

export interface GraphInput {
  interests: Interest[]; discoveries: Discovery[]; questions: Question[]; notes: Note[];
  experiments: Experiment[]; interactions: Interaction[]; nodes: KnowledgeNode[]; edges: KnowledgeEdge[];
}

const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n)}…` : s);
const NOTE_JA = { idea: 'アイデア', insight: '気づき', log: '日常の記録' } as const;

/**
 * 蓄積されたデータから知識グラフを組み立てる（純粋関数）。
 * - Topic: 興味すべて / Discovery: 保存・興味あり・試す予定・実験のきっかけ・明示的に追加したもの
 * - Question: 疑問すべて / Insight: 気づき・アイデア（と明示的に追加した記録） / Experiment: 実験すべて
 * - 自由ノード: ユーザーがNetworkで作ったもの
 */
export function buildGraph(input: GraphInput): Graph {
  const rec = new Map(input.nodes.map((n) => [n.id, n]));
  const nodes: GraphNode[] = [];
  let hiddenCount = 0;
  const push = (n: Omit<GraphNode, 'x' | 'y'>) => {
    const r = rec.get(n.id);
    if (r?.hidden) { hiddenCount++; return; }
    nodes.push({ ...n, x: r?.x, y: r?.y });
  };

  for (const i of input.interests) {
    push({
      id: nodeId('topic', i.id), type: 'topic', label: i.name, refId: i.id, free: false, tags: [i.name], text: i.name,
      detail: `興味プロフィールのテーマ（重み ${i.weight}${i.origin === 'inferred' ? '・記録から推定' : ''}）`,
    });
  }

  const states = deriveStates(input.interactions);
  const seeds = new Set(input.experiments.map((e) => e.discoveryId).filter(Boolean));
  for (const d of input.discoveries) {
    const id = nodeId('discovery', d.id);
    const st = states.get(d.id);
    if (!(st?.saved || st?.rating === 'like' || st?.planned || seeds.has(d.id) || rec.get(id)?.pinned)) continue;
    push({ id, type: 'discovery', label: short(d.title, 26), refId: d.id, free: false, tags: d.tags, text: `${d.title} ${d.fact}`, detail: d.fact });
  }

  for (const q of input.questions) {
    push({
      id: nodeId('question', q.id), type: 'question', label: short(q.text), refId: q.id, free: false, tags: extractTags(q.text), text: q.text,
      detail: `${q.text}（${q.status === 'open' ? '未解決' : '解決済み'}）`,
    });
  }

  for (const n of input.notes) {
    const id = nodeId('insight', n.id);
    if (!(n.kind === 'insight' || n.kind === 'idea' || rec.get(id)?.pinned)) continue;
    push({ id, type: 'insight', label: short(n.text), refId: n.id, free: false, tags: n.tags, text: n.text, detail: `${NOTE_JA[n.kind]}: ${n.text}` });
  }

  for (const e of input.experiments) {
    const text = `${e.title} ${e.hypothesis} ${e.plan} ${e.result ?? ''}`;
    push({
      id: nodeId('experiment', e.id), type: 'experiment', label: short(e.title), refId: e.id, free: false, tags: extractTags(text), text,
      detail: `仮説: ${e.hypothesis || '（未記入）'}${e.result ? `\n結果: ${e.result}` : ''}`,
    });
  }

  for (const n of input.nodes) {
    if (!isFreeNode(n.id) || n.hidden) continue;
    const text = `${n.label} ${n.note ?? ''}`;
    nodes.push({ id: n.id, type: n.type, label: short(n.label), free: true, tags: extractTags(text), text, detail: n.note || n.label, x: n.x, y: n.y });
  }

  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const e of input.edges) {
    if (e.status !== 'active' || !ids.has(e.sourceNode) || !ids.has(e.targetNode) || e.sourceNode === e.targetNode) continue;
    const k = pairKey(e.sourceNode, e.targetNode);
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push({ id: e.id, source: e.sourceNode, target: e.targetNode, relation: e.relation, origin: e.origin });
  }
  return { nodes, edges, hiddenCount };
}

export interface EdgeSuggestion {
  key: string; sourceNode: string; targetNode: string; relation: string; score: number;
  /** なぜ候補に挙がったか（推測の根拠。断定ではない） */
  reason: string;
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/**
 * 関連づけの候補（ルールベース）。すでに結んだ組・却下した組は出さない。
 * あくまで候補であり、ユーザーが承認したものだけがエッジになる。
 */
export function suggestEdges(graph: Graph, input: Pick<GraphInput, 'discoveries' | 'edges'>, limit = 8): EdgeSuggestion[] {
  const taken = new Set(input.edges.map((e) => pairKey(e.sourceNode, e.targetNode)));
  const discById = new Map(input.discoveries.map((d) => [d.id, d]));
  const out: EdgeSuggestion[] = [];
  const add = (a: GraphNode, b: GraphNode, relation: string, score: number, reason: string) => {
    const key = pairKey(a.id, b.id);
    if (a.id === b.id || taken.has(key)) return;
    taken.add(key);
    out.push({ key, sourceNode: a.id, targetNode: b.id, relation, score, reason });
  };

  const topics = graph.nodes.filter((n) => n.type === 'topic');
  const discs = graph.nodes.filter((n) => n.type === 'discovery' && !n.free);
  const texts = graph.nodes.filter((n) => n.type !== 'topic' && (n.type !== 'discovery' || n.free));

  for (const t of topics) {
    for (const dn of discs) {
      const d = dn.refId ? discById.get(dn.refId) : undefined;
      if (d && matchesInterest(d, t.label)) add(t, dn, '関連テーマ', 0.9, `テーマ「${t.label}」が、この発見の題材やタグと重なっています。`);
    }
  }
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const a = discById.get(discs[i].refId ?? ''), b = discById.get(discs[j].refId ?? '');
      if (!a || !b) continue;
      const shared = a.tags.filter((t) => b.tags.includes(t));
      if (shared.length >= 1 && a.category !== b.category) {
        add(discs[i], discs[j], `共通: ${shared.join('・')}`, 0.6 + 0.05 * shared.length, '分野は違いますが、共通するテーマがあります。');
      } else if (shared.length >= 2) {
        add(discs[i], discs[j], `共通: ${shared.join('・')}`, 0.5 + 0.05 * shared.length, '共通するテーマが複数あります。');
      }
    }
  }
  for (const n of texts) {
    const body = norm(n.text);
    for (const t of topics) {
      if (t.label.length >= 2 && body.includes(norm(t.label))) add(n, t, '関連しそう', 0.8, `文中に「${t.label}」が出てきます。`);
    }
    for (const dn of discs) {
      const hit = dn.tags.filter((tg) => tg.length >= 2 && body.includes(norm(tg)));
      if (hit.length) add(n, dn, `関連しそう: ${hit[0]}`, 0.7, `文中に、この発見のテーマ「${hit.join('」「')}」が出てきます。`);
    }
  }
  return out.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key)).slice(0, limit);
}

// ---- 配置 ----
// ノードは横長（幅 100〜170px・高さ 約50px）なので、等方的な空間で配置してから横方向にだけ広げる。
const REPULSE = 120;   // 斥力の基準距離（配置空間）
const LINK_LEN = 135;  // つながったノード間の自然な距離（配置空間）
const GRAVITY = 1.6;   // 中心へ引く強さ。小さいほど散らばる
export const X_STRETCH = 1.5;
/** ノード1つが占める大きさ（余白込み）。CSS の .kn の最大幅 170px・高さ約50px に合わせている */
export const NODE_W = 186;
export const NODE_H = 66;

/**
 * 位置が決まっていないノードを配置する。乱数を使わないので、同じ入力なら同じ結果になる。
 * 位置を持つノード（ユーザーが動かした／以前に配置した）は動かさない。
 * 目標: 隣どうしが重ならず、かつ縮小しなくても読める程度に詰まっていること。
 */
export function layoutGraph(
  nodes: Pick<GraphNode, 'id' | 'type' | 'x' | 'y'>[],
  edges: Pick<GraphEdge, 'source' | 'target'>[],
): Map<string, { x: number; y: number }> {
  const order: NodeType[] = ['topic', 'discovery', 'question', 'insight', 'experiment'];
  const pos = new Map<string, { x: number; y: number; fixed: boolean }>();
  const fixed = nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  // 配置空間では x を 1/X_STRETCH にして扱う
  for (const n of fixed) pos.set(n.id, { x: n.x! / X_STRETCH, y: n.y!, fixed: true });
  const cx = fixed.length ? fixed.reduce((s, n) => s + n.x! / X_STRETCH, 0) / fixed.length : 0;
  const cy = fixed.length ? fixed.reduce((s, n) => s + n.y!, 0) / fixed.length : 0;

  const free = nodes.filter((n) => !pos.has(n.id)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.id.localeCompare(b.id));
  free.forEach((n, i) => {
    // 種類ごとに半径を変えた渦巻き状に置く（テーマが内側）。黄金角でずらして重なりを避ける
    const angle = i * 2.399963;
    const radius = 40 + order.indexOf(n.type) * 28 + Math.sqrt(i + 1) * 46;
    pos.set(n.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, fixed: false });
  });
  const ids = [...pos.keys()];
  const result = (pts: { x: number; y: number }[]) => new Map(ids.map((id, i) => [id, { x: Math.round(pts[i].x), y: Math.round(pts[i].y) }]));
  if (free.length === 0) return result([...pos.values()].map((p) => ({ x: p.x * X_STRETCH, y: p.y })));

  const list = [...pos.values()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const links = edges.map((e) => [index.get(e.source), index.get(e.target)] as const).filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined && l[0] !== l[1]);
  const iters = Math.min(320, 120 + list.length * 3);
  const fx = new Float64Array(list.length), fy = new Float64Array(list.length);
  for (let it = 0; it < iters; it++) {
    const temp = 36 * (1 - it / iters) + 0.6;
    fx.fill(0); fy.fill(0);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let vx = list[i].x - list[j].x, vy = list[i].y - list[j].y;
        let dist = Math.hypot(vx, vy);
        if (dist < 0.01) { vx = 0.1 + (i - j) * 0.05; vy = 0.07; dist = Math.hypot(vx, vy); }
        if (dist > REPULSE * 4) continue;
        const f = (REPULSE * REPULSE) / (dist * dist); // 斥力（大きさ REPULSE²/dist）
        fx[i] += vx * f; fy[i] += vy * f; fx[j] -= vx * f; fy[j] -= vy * f;
      }
    }
    for (const [a, b] of links) {
      const vx = list[a].x - list[b].x, vy = list[a].y - list[b].y;
      const dist = Math.hypot(vx, vy) || 0.01;
      const f = ((dist - LINK_LEN) * 0.9) / dist; // ばね: 自然長より遠ければ引き、近ければ離す
      fx[a] -= vx * f; fy[a] -= vy * f; fx[b] += vx * f; fy[b] += vy * f;
    }
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.fixed) continue;
      const gx = fx[i] - (p.x - cx) * GRAVITY, gy = fy[i] - (p.y - cy) * GRAVITY;
      const len = Math.hypot(gx, gy);
      if (len < 1e-9) continue;
      const step = Math.min(len, temp);
      p.x += (gx / len) * step; p.y += (gy / len) * step;
    }
  }

  // 仕上げ: ノードを矩形とみなして、重なっている組を押し分ける（動かせるのは未配置のノードだけ）
  const out = list.map((p) => ({ x: p.x * X_STRETCH, y: p.y, fixed: p.fixed }));
  for (let pass = 0, max = Math.min(400, 60 + out.length * 3); pass < max; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.fixed && b.fixed) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const ox = NODE_W - Math.abs(dx), oy = NODE_H - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // めり込みの浅い軸（たいてい縦）に沿って離す。片方が固定なら、もう片方だけを動かす
        const vertical = oy <= ox;
        const gap = (vertical ? oy : ox) + 1;
        const sign = (vertical ? dy : dx) >= 0 ? 1 : -1;
        const sa = a.fixed ? 0 : b.fixed ? gap : gap / 2, sb = b.fixed ? 0 : a.fixed ? gap : gap / 2;
        if (vertical) { a.y += sign * sa; b.y -= sign * sb; } else { a.x += sign * sa; b.x -= sign * sb; }
      }
    }
    if (!moved) break;
  }
  return result(out);
}
