import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Actions, Kicker, Row, SectionHead } from '../components/parts';
import type { Scores } from '../domain/types';
import { pinNode } from '../knowledge/actions';
import { buildGraph, nodeId } from '../knowledge/graph';
import { useLucida } from '../store';

const SCORE_LABEL: Record<keyof Omit<Scores, 'total'>, string> = {
  interest: 'Interest 興味との関連', novelty: 'Novelty 新規性', utility: 'Utility 実用性', timing: 'Timing タイミング', diversity: 'Diversity 多様性',
};

const ORIGIN_JA = { bundled: '同梱カタログ', ai: 'AI・検索由来', user: '自分で追加' } as const;
const safeDecode = (u: string) => { try { return decodeURI(u); } catch { return u; } };

export function DiscoveryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, generate, addSource, toggleVerified, removeSource, say, mutate } = useLucida();
  const inNetwork = useMemo(() => buildGraph(data).nodes.some((n) => n.id === nodeId('discovery', id ?? '')), [data, id]);
  const [busy, setBusy] = useState(false);
  const [relMsg, setRelMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', url: '', note: '' });
  const [formErr, setFormErr] = useState<string | null>(null);
  const d = data.discoveries.find((x) => x.id === id);
  const sources = data.sources.filter((s) => s.discoveryId === id);
  const related = useMemo(() => {
    if (!d) return [];
    return data.discoveries
      .filter((x) => x.id !== d.id)
      .map((x) => ({ x, n: x.tags.filter((t) => d.tags.includes(t)).length + (x.category === d.category ? 0.5 : 0) }))
      .filter((r) => r.n >= 1).sort((a, b) => b.n - a.n).slice(0, 3).map((r) => r.x);
  }, [d, data.discoveries]);

  if (!d) {
    return <div className="page"><p className="empty">この発見は見つかりませんでした。</p><button className="btn" onClick={() => nav('/')}>ホームへ</button></div>;
  }
  return (
    <article className="page detail">
      <button className="link back" onClick={() => nav(-1)}>← 戻る</button>
      <Kicker d={d} />
      <h1 className="page-title">{d.title}</h1>

      <section>
        <h2 className="label"><span className="tag fact">事実</span><span>Fact · 出典あり</span></h2>
        <p className="body-serif">{d.fact}</p>
        <ul className="sources">
          {sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
              <span className="small muted">
                {ORIGIN_JA[s.origin ?? 'bundled']} · 記録日時 {new Date(s.fetchedAt).toLocaleDateString('ja-JP')}
                {s.verifiedAt ? ` · 確認済み（${new Date(s.verifiedAt).toLocaleDateString('ja-JP')}）` : ' · 未確認'}
              </span>
              <span className="small muted url">{safeDecode(s.url)}</span>
              {s.note && <span className="small muted">{s.note}</span>}
              <span className="small">
                <button className="link" onClick={() => toggleVerified(s.id)}>{s.verifiedAt ? '確認済みを解除' : 'リンク先を確認した'}</button>
                {s.origin === 'user' && <> · <button className="link danger" onClick={() => removeSource(s.id).catch((e) => say(e.message))}>削除</button></>}
              </span>
            </li>
          ))}
        </ul>
        <details className="why">
          <summary>出典を自分で追加する</summary>
          <form className="form" onSubmit={async (e) => {
            e.preventDefault(); setFormErr(null);
            try { await addSource(d.id, form); setForm({ title: '', url: '', note: '' }); say('出典を追加しました'); }
            catch (err) { setFormErr((err as Error).message); }
          }}>
            <label className="field-label" htmlFor="s-url">URL</label>
            <input id="s-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" inputMode="url" required />
            <label className="field-label" htmlFor="s-title">タイトル（任意）</label>
            <input id="s-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
            <label className="field-label" htmlFor="s-note">メモ（任意）</label>
            <input id="s-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} />
            <div className="form-foot"><button className="btn" type="submit">追加</button></div>
            {formErr && <p role="alert" className="banner error">{formErr}</p>}
          </form>
        </details>
      </section>

      <section>
        <h2 className="label"><span className="tag infer">推測</span><span>Reasoning · 確認されていない考察</span></h2>
        {d.reasoning.split('\n').map((p, i) => <p key={i} className="body-serif">{p}</p>)}
      </section>

      <section>
        <h2 className="label"><span className="tag suggest">提案</span><span>Suggestion · 試してみること</span></h2>
        <p className="body-serif">{d.suggestion}</p>
      </section>

      <Actions d={d} />
      <p className="head-links next-steps">
        <Link className="btn" to={`/lab?from=${d.id}`}>この提案を実験にする</Link>
        {inNetwork
          ? <Link className="btn" to="/network">Networkで見る</Link>
          : <button className="btn" onClick={() => mutate((repo) => pinNode(repo, 'discovery', d.id, d.title)).then(() => say('Networkに追加しました'), () => say('追加に失敗しました'))}>Networkに追加</button>}
      </p>

      <details className="why">
        <summary>なぜこの発見が選ばれたか</summary>
        <dl>
          {(Object.keys(SCORE_LABEL) as (keyof typeof SCORE_LABEL)[]).map((k) => (
            <div key={k}><dt>{SCORE_LABEL[k]}</dt><dd><span className="bar"><i style={{ width: `${Math.round(d.scores[k] * 100)}%` }} /></span>{Math.round(d.scores[k] * 100)}</dd></div>
          ))}
        </dl>
      </details>

      <section>
        <SectionHead en="Related" ja="関連する発見" />
        {related.length > 0 && <ol className="rows">{related.map((r) => <Row key={r.id} d={r} />)}</ol>}
        <div className="more">
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setRelMsg(null);
            try {
              const r = await generate({ count: 2, keywords: d.tags.filter((t) => t.length >= 2), web: true });
              setRelMsg(r.created.length ? `${r.created.length}件の関連する発見を追加しました。` : r.notice ?? '関連する新しい発見はありませんでした。');
            } catch (e) { console.error(e); setRelMsg('関連する発見の生成に失敗しました。'); } finally { setBusy(false); }
          }}>{busy ? '探しています…' : '関連する発見を新しく探す'}</button>
        </div>
        {relMsg && <p className="banner" role="status">{relMsg}</p>}
        <p className="small muted">テーマから探索する：</p>
        <p className="chips">{d.tags.map((t) => <Link key={t} className="chip" to={`/explore?q=${encodeURIComponent(t)}`}>{t}</Link>)}</p>
      </section>
    </article>
  );
}
