import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Background, Controls, Handle, Position, ReactFlow, useNodesState,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PageHead, SectionHead } from '../components/parts';
import { NODE_TYPES, NODE_TYPE_JA, type NodeType } from '../domain/types';
import { addEdge, addFreeNode, dismissSuggestion, hideNode, removeEdge, resetLayout, restoreHidden, savePositions } from '../knowledge/actions';
import { buildGraph, layoutGraph, suggestEdges, type GraphNode } from '../knowledge/graph';
import { useLucida } from '../store';

type KData = { label: string; kind: NodeType };
type KNodeType = Node<KData, 'k'>;

function KNode({ data, selected }: NodeProps<KNodeType>) {
  return (
    <div className={`kn kn-${data.kind}${selected ? ' sel' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <span className="kn-type">{NODE_TYPE_JA[data.kind]}</span>
      <span className="kn-label">{data.label}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { k: KNode };
const ORIGIN_JA = { user: '自分で結んだ', ai: '候補を承認', system: '記録から' } as const;

function entityLink(n: GraphNode): { to: string; label: string } | null {
  if (n.free) return null;
  if (n.type === 'discovery') return { to: `/d/${n.refId}`, label: '発見を開く' };
  if (n.type === 'experiment') return { to: `/lab/${n.refId}`, label: '実験を開く' };
  if (n.type === 'topic') return { to: '/profile', label: '興味プロフィールで見る' };
  return { to: '/archive', label: 'Archiveで見る' };
}

export default function Network() {
  const { data, mutate, say } = useLucida();
  const graph = useMemo(() => buildGraph(data), [data]);
  const suggestions = useMemo(() => suggestEdges(graph, data), [graph, data]);
  const positions = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [shown, setShown] = useState<Set<NodeType>>(() => new Set(NODE_TYPES));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'topic' as NodeType, label: '', note: '' });
  const [link, setLink] = useState({ target: '', relation: '' });
  const detailRef = useRef<HTMLElement>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try { await fn(); if (ok) say(ok); } catch (e) { console.error(e); setError((e as Error).message || '保存に失敗しました'); }
  }, [say]);

  // 自動配置した位置は保存して、次に開いても同じ場所に出す（新しいノードだけが周りに置かれる）
  const savedKey = useRef('');
  useEffect(() => {
    const missing = graph.nodes.filter((n) => n.x === undefined || n.y === undefined);
    const key = missing.map((n) => n.id).join(',');
    if (!missing.length || savedKey.current === key) return;
    savedKey.current = key;
    void mutate((repo) => savePositions(repo, missing.map((n) => ({ id: n.id, type: n.type, label: n.label, refId: n.refId, ...positions.get(n.id)! }))))
      .catch((e) => console.error(e));
  }, [graph, positions, mutate]);

  const visible = useMemo(() => graph.nodes.filter((n) => shown.has(n.type)), [graph, shown]);
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const rfNodes = useMemo<KNodeType[]>(() => visible.map((n) => ({
    id: n.id, type: 'k', position: positions.get(n.id) ?? { x: 0, y: 0 }, data: { label: n.label, kind: n.type }, selected: n.id === selectedId,
  })), [visible, positions, selectedId]);
  const rfEdges = useMemo<Edge[]>(() => graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)).map((e) => ({
    id: e.id, source: e.source, target: e.target, label: e.relation, className: `ke ke-${e.origin}`,
    labelBgStyle: { fill: '#f8f4ea' }, labelBgPadding: [5, 2] as [number, number], labelStyle: { fill: '#5a5953', fontSize: 10 },
  })), [graph, visibleIds]);
  const [nodes, setNodes, onNodesChange] = useNodesState<KNodeType>(rfNodes);
  useEffect(() => { setNodes(rfNodes); }, [rfNodes, setNodes]);

  const select = (id: string | null) => {
    setSelectedId(id); setLink({ target: '', relation: '' }); setError(null);
    if (id) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const onConnect = (c: Connection) => {
    if (c.source && c.target) void run(() => mutate((repo) => addEdge(repo, { source: c.source, target: c.target, relation: '関連', origin: 'user' })), 'つなぎました');
  };

  const neighbors = selected ? graph.edges.filter((e) => e.source === selected.id || e.target === selected.id) : [];
  const connectedIds = new Set(neighbors.flatMap((e) => [e.source, e.target]));
  const linkable = selected ? graph.nodes.filter((n) => n.id !== selected.id && !connectedIds.has(n.id)) : [];
  const exploreWord = selected ? (selected.type === 'topic' ? selected.label : selected.tags[0] ?? '') : '';

  return (
    <div className="page">
      <PageHead kicker="Network" title="知識のつながり">
        <p className="lede">興味・発見・疑問・気づき・実験を、ノードとつながりで見渡します。</p>
      </PageHead>
      {error && <p role="alert" className="banner error">{error}</p>}

      {graph.nodes.length === 0 ? (
        <p className="empty">
          まだノードがありません。<Link to="/profile">興味を追加</Link>する、発見を保存する、<Link to="/capture">疑問や気づきを記録</Link>すると、ここに並びます。
          {graph.hiddenCount > 0 && <> 非表示にしたノードが{graph.hiddenCount}件あります。</>}
        </p>
      ) : (
        <>
          <div className="net-tools">
            <div className="seg" role="group" aria-label="表示の切り替え">
              <button className="chip" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>グラフ</button>
              <button className="chip" aria-pressed={view === 'list'} onClick={() => setView('list')}>一覧</button>
            </div>
            <div className="chips" role="group" aria-label="ノードの種類">
              {NODE_TYPES.map((t) => {
                const count = graph.nodes.filter((n) => n.type === t).length;
                return (
                  <button key={t} className={`chip kt kt-${t}`} aria-pressed={shown.has(t)} disabled={count === 0}
                    onClick={() => setShown((s) => { const next = new Set(s); if (next.has(t)) next.delete(t); else next.add(t); return next; })}>
                    <i aria-hidden="true" />{NODE_TYPE_JA[t]}<small>{count}</small>
                  </button>
                );
              })}
            </div>
          </div>

          {view === 'graph' ? (
            <div className="net-canvas" aria-label="知識グラフ">
              <ReactFlow
                nodes={nodes} edges={rfEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
                onNodeClick={(_, n) => select(n.id)} onPaneClick={() => select(null)} onConnect={onConnect}
                onNodeDragStop={(_, n) => {
                  const g = byId.get(n.id);
                  if (g) void mutate((repo) => savePositions(repo, [{ id: g.id, type: g.type, label: g.label, refId: g.refId, x: n.position.x, y: n.position.y }])).catch((e) => console.error(e));
                }}
                fitView fitViewOptions={{ padding: 0.12, minZoom: 0.8, maxZoom: 1 }} minZoom={0.3} maxZoom={1.6}
                zoomOnScroll={false} preventScrolling={false} nodesFocusable edgesFocusable={false}
              >
                <Background gap={28} size={1} color="#d6ccb3" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          ) : (
            <div className="net-list">
              {NODE_TYPES.filter((t) => shown.has(t)).map((t) => {
                const list = graph.nodes.filter((n) => n.type === t);
                if (!list.length) return null;
                return (
                  <section key={t}>
                    <h3 className="label">{NODE_TYPE_JA[t]}<span>{list.length}</span></h3>
                    <ul>{list.map((n) => (
                      <li key={n.id}><button className={`node-row kt-${n.type}`} aria-pressed={n.id === selectedId} onClick={() => select(n.id)}><i aria-hidden="true" />{n.label}</button></li>
                    ))}</ul>
                  </section>
                );
              })}
            </div>
          )}
          <p className="small muted net-hint">
            ノードを選ぶと詳細が下に出ます。ドラッグで動かせます。
            {' '}<button className="link" onClick={() => run(() => mutate((repo) => resetLayout(repo)), '配置をやり直しました')}>整列し直す</button>
            {graph.hiddenCount > 0 && <> · <button className="link" onClick={() => run(() => mutate((repo) => restoreHidden(repo)), '非表示のノードを戻しました')}>非表示の{graph.hiddenCount}件を戻す</button></>}
          </p>
        </>
      )}

      {selected && (
        <section className="node-detail" ref={detailRef} aria-live="polite">
          <p className="kicker"><span>{NODE_TYPE_JA[selected.type]}</span>{selected.free && <><span className="dot">·</span><span>自分で追加</span></>}</p>
          <h2 className="node-title">{selected.label}</h2>
          {selected.detail.split('\n').map((p, i) => <p key={i} className="body-serif">{p}</p>)}
          <p className="head-links">
            {entityLink(selected) && <Link className="btn" to={entityLink(selected)!.to}>{entityLink(selected)!.label}</Link>}
            {exploreWord && <Link className="btn primary" to={`/explore?q=${encodeURIComponent(exploreWord)}`}>「{exploreWord}」から探索する</Link>}
          </p>

          <h3 className="label">つながり<span>{neighbors.length}</span></h3>
          {neighbors.length === 0 ? <p className="muted small">まだ、どこともつながっていません。</p> : (
            <ul className="links">
              {neighbors.map((e) => {
                const other = byId.get(e.source === selected.id ? e.target : e.source);
                return (
                  <li key={e.id}>
                    <button className="link" onClick={() => select(other?.id ?? null)}>{other?.label}</button>
                    <span className="small muted">{e.relation} · {ORIGIN_JA[e.origin]}</span>
                    <button className="link danger" onClick={() => run(() => mutate((repo) => removeEdge(repo, e.id)))} aria-label={`${other?.label} とのつながりを外す`}>外す</button>
                  </li>
                );
              })}
            </ul>
          )}
          {linkable.length > 0 && (
            <form className="link-form" onSubmit={(ev) => {
              ev.preventDefault();
              if (!link.target) return;
              void run(async () => { await mutate((repo) => addEdge(repo, { source: selected.id, target: link.target, relation: link.relation, origin: 'user' })); setLink({ target: '', relation: '' }); }, 'つなぎました');
            }}>
              <label className="sr" htmlFor="lk-t">つなぐ先</label>
              <select id="lk-t" value={link.target} onChange={(e) => setLink({ ...link, target: e.target.value })}>
                <option value="">つなぐ先を選ぶ</option>
                {linkable.map((n) => <option key={n.id} value={n.id}>{NODE_TYPE_JA[n.type]}: {n.label}</option>)}
              </select>
              <label className="sr" htmlFor="lk-r">関係</label>
              <input id="lk-r" value={link.relation} onChange={(e) => setLink({ ...link, relation: e.target.value })} placeholder="関係（例：原因、似ている）" maxLength={40} />
              <button className="btn" type="submit" disabled={!link.target}>つなぐ</button>
            </form>
          )}
          <p className="small">
            <button className="link danger" onClick={() => {
              const n = selected;
              void run(async () => { await mutate((repo) => hideNode(repo, n)); setSelectedId(null); }, n.free ? 'ノードを削除しました' : 'Networkから外しました（元の記録は残っています）');
            }}>{selected.free ? 'このノードを削除' : 'Networkから外す（元の記録は残ります）'}</button>
          </p>
        </section>
      )}

      {suggestions.length > 0 && (
        <section>
          <SectionHead en="Suggested Links" ja="関連づけの候補" />
          <p className="small muted">共通する言葉やテーマから機械的に挙げた候補です。承認したものだけが、つながりになります。</p>
          <ul className="exps">
            {suggestions.map((s) => {
              const a = byId.get(s.sourceNode), b = byId.get(s.targetNode);
              if (!a || !b) return null;
              return (
                <li key={s.key} className="sug">
                  <span className="tag infer">推測</span>
                  <p><button className="link" onClick={() => select(a.id)}>{a.label}</button> と <button className="link" onClick={() => select(b.id)}>{b.label}</button></p>
                  <p className="small muted">{s.reason}（{s.relation}）</p>
                  <p className="actions compact">
                    <button className="act" onClick={() => run(() => mutate((repo) => addEdge(repo, { source: s.sourceNode, target: s.targetNode, relation: s.relation, origin: 'ai' })), 'つなぎました')}>つなぐ</button>
                    <button className="act" onClick={() => run(() => mutate((repo) => dismissSuggestion(repo, s)))}>違う</button>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <SectionHead en="Add a Node" ja="ノードを自分で追加" />
        <form className="form" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { const id = await mutate((repo) => addFreeNode(repo, form)); setForm({ ...form, label: '', note: '' }); setSelectedId(id); }, 'ノードを追加しました');
        }}>
          <label className="field-label" htmlFor="nn-type">種類</label>
          <select id="nn-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as NodeType })}>
            <option value="topic">テーマ</option><option value="question">疑問</option><option value="insight">気づき</option>
          </select>
          <label className="field-label" htmlFor="nn-label">名前</label>
          <input id="nn-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={80} required />
          <label className="field-label" htmlFor="nn-note">メモ（任意）</label>
          <input id="nn-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
          <div className="form-foot"><button className="btn" type="submit" disabled={!form.label.trim()}>追加</button></div>
        </form>
        <p className="small muted">発見・実験のノードは、発見の保存や実験の作成から自動で作られます。</p>
      </section>
    </div>
  );
}
