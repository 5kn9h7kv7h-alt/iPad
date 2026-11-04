import { Link } from 'react-router-dom';
import { CATEGORY_JA, type Discovery } from '../domain/types';
import { useLucida } from '../store';

export function Kicker({ d }: { d: Discovery }) {
  return (
    <p className="kicker">
      <span>{d.category}</span><span className="dot">·</span><span>{CATEGORY_JA[d.category]}</span>
      {d.provenance === 'ai' && <><span className="dot">·</span><span>AI生成</span></>}
    </p>
  );
}

export function Actions({ d, compact = false }: { d: Discovery; compact?: boolean }) {
  const { stateOf, react, say } = useLucida();
  const st = stateOf(d.id);
  const run = (kind: Parameters<typeof react>[1], okMsg?: string) => async () => {
    try { await react(d.id, kind); if (okMsg) say(okMsg); } catch (e) { console.error(e); say('保存に失敗しました。もう一度お試しください'); }
  };
  return (
    <div className={`actions${compact ? ' compact' : ''}`} role="group" aria-label={`${d.title} への操作`}>
      <button className="act" aria-pressed={st.saved} onClick={run(st.saved ? 'unsave' : 'save', st.saved ? undefined : 'Archiveに保存しました')}>
        {st.saved ? '保存済み' : '保存'}
      </button>
      <button className="act" aria-pressed={st.rating === 'like'} onClick={run(st.rating === 'like' ? 'clear_rating' : 'like')}>興味あり</button>
      <button className="act" aria-pressed={st.rating === 'dislike'} onClick={run(st.rating === 'dislike' ? 'clear_rating' : 'dislike')}>興味なし</button>
      {!compact && (
        <button className="act" aria-pressed={st.planned} onClick={run(st.planned ? 'unplan' : 'plan', st.planned ? undefined : '「試す予定」に追加しました（Labで確認できます）')}>
          {st.planned ? '試す予定' : '試してみる'}
        </button>
      )}
    </div>
  );
}

export function Row({ d, index }: { d: Discovery; index?: number }) {
  const { stateOf } = useLucida();
  const st = stateOf(d.id);
  return (
    <li className="row">
      {index !== undefined && <span className="row-num" aria-hidden="true">{String(index).padStart(2, '0')}</span>}
      <div className="row-body">
        <Kicker d={d} />
        <h3 className="row-title"><Link to={`/d/${d.id}`}>{d.title}</Link></h3>
        <p className="row-fact">{d.fact}</p>
        <div className="row-foot">
          <Actions d={d} compact />
          {(st.saved || st.planned) && <span className="marks">{st.saved && '保存済み'}{st.saved && st.planned && ' · '}{st.planned && '試す予定'}</span>}
        </div>
      </div>
    </li>
  );
}

export function SectionHead({ en, ja, aside }: { en: string; ja?: string; aside?: React.ReactNode }) {
  return (
    <div className="sec-head">
      <h2 className="sec-title"><span className="en">{en}</span>{ja && <span className="ja">{ja}</span>}</h2>
      {aside}
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <p className="kicker">{kicker}</p>
      <h1 className="page-title">{title}</h1>
      {children}
    </header>
  );
}
