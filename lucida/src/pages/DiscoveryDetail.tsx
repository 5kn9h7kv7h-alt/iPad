import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Actions, Kicker, Row, SectionHead } from '../components/parts';
import type { Scores } from '../domain/types';
import { useLucida } from '../store';

const SCORE_LABEL: Record<keyof Omit<Scores, 'total'>, string> = {
  interest: 'Interest 興味との関連', novelty: 'Novelty 新規性', utility: 'Utility 実用性', timing: 'Timing タイミング', diversity: 'Diversity 多様性',
};

const safeDecode = (u: string) => { try { return decodeURI(u); } catch { return u; } };

export function DiscoveryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data } = useLucida();
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
              <span className="small muted">記録日時 {new Date(s.fetchedAt).toLocaleDateString('ja-JP')}　{safeDecode(s.url)}</span>
              {s.note && <span className="small muted">{s.note}</span>}
            </li>
          ))}
        </ul>
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
        <p className="small muted">テーマから探索する：</p>
        <p className="chips">{d.tags.map((t) => <Link key={t} className="chip" to={`/explore?q=${encodeURIComponent(t)}`}>{t}</Link>)}</p>
      </section>
    </article>
  );
}
