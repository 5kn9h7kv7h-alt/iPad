import { Link } from 'react-router-dom';
import { PageHead, SectionHead } from '../components/parts';
import { useLucida } from '../store';

export function Network() {
  const { data } = useLucida();
  const rows: [string, number, string][] = [
    ['Topic', data.interests.length, '興味プロフィール'],
    ['Discovery', data.discoveries.length, '発見'],
    ['Question', data.questions.length, '疑問'],
    ['Insight', data.notes.filter((n) => n.kind === 'insight').length, '気づき'],
    ['Experiment', data.interactions.filter((i) => i.kind === 'plan').length, '試す予定（実験の種）'],
  ];
  return (
    <div className="page">
      <PageHead kicker="Network" title="知識のつながり">
        <p className="lede">知識をノードとエッジで結ぶグラフ画面は、Phase 3 で実装します。</p>
      </PageHead>
      <section>
        <SectionHead en="Nodes in the making" ja="ノードになる素材" />
        <p className="muted">いま蓄積されている素材です。Phase 3 で、これらがノードとして可視化され、関連づけができるようになります。</p>
        <dl className="facts">
          {rows.map(([en, n, ja]) => <div key={en}><dt>{en}<small>{ja}</small></dt><dd>{n}</dd></div>)}
        </dl>
        <p><Link to="/archive">Archiveで素材を見る →</Link></p>
      </section>
    </div>
  );
}
