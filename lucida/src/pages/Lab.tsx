import { Link } from 'react-router-dom';
import { PageHead, SectionHead } from '../components/parts';
import { useLucida } from '../store';

export function Lab() {
  const { data, stateOf, react } = useLucida();
  const planned = data.discoveries.filter((d) => stateOf(d.id).planned).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="page">
      <PageHead kicker="Lab" title="試してみる">
        <p className="lede">仮説・期間・実施記録・結果のAI分析は Phase 3 で実装します。いまは「試す予定」を一覧できます。</p>
      </PageHead>
      <section>
        <SectionHead en="Planned" ja={`試す予定 ${planned.length}件`} />
        {planned.length === 0 ? (
          <p className="empty">まだ予定はありません。発見の「試してみる」を押すと、ここに並びます。<Link to="/">ホームへ</Link></p>
        ) : (
          <ul className="exps">
            {planned.map((d) => (
              <li key={d.id}>
                <span className="tag suggest">提案</span>
                <p>{d.suggestion}</p>
                <p className="small muted"><Link to={`/d/${d.id}`}>{d.title}</Link> · <button className="link" onClick={() => react(d.id, 'unplan')}>予定を外す</button></p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
