import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHead, Row } from '../components/parts';
import { CATEGORIES, OUTCOME_JA, type Category } from '../domain/types';
import { relTime } from '../domain/util';
import { useLucida } from '../store';

const TABS = [['discoveries', '発見'], ['saved', '保存'], ['questions', '疑問'], ['notes', '記録'], ['experiments', '実験'], ['sources', '出典']] as const;
type Tab = (typeof TABS)[number][0];

const day = (iso: string) => iso.slice(0, 10);
const kindJa = { idea: 'アイデア', insight: '気づき', log: '日常の記録' } as const;

export function Archive() {
  const { data, stateOf, setQuestionStatus, removeQuestion, removeNote } = useLucida();
  const [tab, setTab] = useState<Tab>('discoveries');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const inRange = (iso: string) => (!from || day(new Date(iso).toISOString()) >= from) && (!to || day(new Date(iso).toISOString()) <= to);
  const has = (...s: string[]) => !q.trim() || s.join(' ').normalize('NFKC').toLowerCase().includes(q.trim().normalize('NFKC').toLowerCase());

  const allTags = useMemo(() => {
    const src = tab === 'notes' ? data.notes.flatMap((n) => n.tags) : data.discoveries.flatMap((d) => d.tags);
    return [...new Set(src)].sort();
  }, [data, tab]);

  const discoveries = useMemo(() => data.discoveries
    .filter((d) => (tab !== 'saved' || stateOf(d.id).saved) && (!cat || d.category === cat) && (!tag || d.tags.includes(tag))
      && inRange(d.createdAt) && has(d.title, d.fact, d.tags.join(' ')))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, tab, cat, tag, from, to, q]);
  const questions = data.questions.filter((x) => inRange(x.createdAt) && has(x.text)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = data.notes.filter((n) => (!tag || n.tags.includes(tag)) && inRange(n.createdAt) && has(n.text, n.tags.join(' '))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const experiments = data.experiments.filter((e) => inRange(e.createdAt) && has(e.title, e.hypothesis, e.result ?? '')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const titles = new Map(data.discoveries.map((d) => [d.id, d]));
  const sources = data.sources.filter((s) => inRange(s.fetchedAt) && has(s.title, s.url, titles.get(s.discoveryId)?.title ?? ''))
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));

  const showCat = tab === 'discoveries' || tab === 'saved';
  const showTag = showCat || tab === 'notes';
  const switchTab = (t: Tab) => { setTab(t); setTag(''); setCat(''); };

  return (
    <div className="page">
      <PageHead kicker="Archive" title="記録の棚" />
      <div className="tabs" role="tablist" aria-label="種類">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => switchTab(id)}>{label}</button>
        ))}
      </div>

      <div className="filters">
        <label className="sr" htmlFor="aq">検索</label>
        <input id="aq" type="search" placeholder="検索" value={q} onChange={(e) => setQ(e.target.value)} />
        {showCat && (
          <><label className="sr" htmlFor="ac">カテゴリ</label>
          <select id="ac" value={cat} onChange={(e) => setCat(e.target.value as Category | '')}>
            <option value="">カテゴリ: すべて</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select></>
        )}
        {showTag && (
          <><label className="sr" htmlFor="at">タグ</label>
          <select id="at" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">タグ: すべて</option>{allTags.map((t) => <option key={t}>{t}</option>)}
          </select></>
        )}
        <label className="date"><span>から</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="開始日" /></label>
        <label className="date"><span>まで</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="終了日" /></label>
      </div>

      <div role="tabpanel">
        {(tab === 'discoveries' || tab === 'saved') && (
          discoveries.length === 0
            ? <p className="empty">{tab === 'saved' ? '保存した発見はまだありません。発見の「保存」を押すとここに並びます。' : '条件に合う発見がありません。'}</p>
            : <ol className="rows">{discoveries.map((d) => <Row key={d.id} d={d} />)}</ol>
        )}
        {tab === 'questions' && (
          questions.length === 0 ? <p className="empty">疑問はまだありません。<Link to="/capture">記録する</Link></p> : (
            <ul className="entries">{questions.map((x) => (
              <li key={x.id}>
                <p className={x.status === 'resolved' ? 'done' : ''}>{x.text}</p>
                <p className="small muted">{relTime(x.createdAt)} · {x.status === 'open' ? '未解決' : '解決済み'}
                  {' · '}<button className="link" onClick={() => setQuestionStatus(x.id, x.status === 'open' ? 'resolved' : 'open')}>{x.status === 'open' ? '解決済みにする' : '未解決に戻す'}</button>
                  {' · '}<button className="link danger" onClick={() => removeQuestion(x.id)}>削除</button></p>
              </li>))}
            </ul>
          )
        )}
        {tab === 'notes' && (
          notes.length === 0 ? <p className="empty">記録はまだありません。<Link to="/capture">記録する</Link></p> : (
            <ul className="entries">{notes.map((n) => (
              <li key={n.id}>
                <p><span className="tag infer">{kindJa[n.kind]}</span> {n.text}</p>
                <p className="small muted">{relTime(n.createdAt)}{n.source && ` · ${n.source === 'calendar' ? 'カレンダーから取り込み' : '学習記録から取り込み'}`}{n.tags.length > 0 && ` · ${n.tags.join('、')}`}
                  {' · '}<button className="link danger" onClick={() => removeNote(n.id)}>削除</button></p>
              </li>))}
            </ul>
          )
        )}
        {tab === 'experiments' && (
          experiments.length === 0 ? <p className="empty">実験の記録はまだありません。<Link to="/lab">Labで始める</Link></p> : (
            <ul className="entries">{experiments.map((e) => (
              <li key={e.id}>
                <p><Link to={`/lab/${e.id}`}>{e.title}</Link></p>
                <p className="small muted">{e.startsOn} 〜 {e.endsOn} · {e.status === 'done' ? `完了${e.outcome ? `（${OUTCOME_JA[e.outcome]}）` : ''}` : e.status === 'running' ? '進行中' : '予定'}</p>
                {e.result && <p><span className="tag fact">結果</span>{e.result}</p>}
                {e.aiAnalysis?.inferences[0] && <p><span className="tag infer">推測</span>{e.aiAnalysis.inferences[0]}</p>}
              </li>))}
            </ul>
          )
        )}
        {tab === 'sources' && (
          sources.length === 0 ? <p className="empty">出典の記録がありません。</p> : (
            <ul className="entries">{sources.map((s) => (
              <li key={s.id}>
                <p><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></p>
                <p className="small muted">{titles.get(s.discoveryId) ? <Link to={`/d/${s.discoveryId}`}>{titles.get(s.discoveryId)!.title}</Link> : '（削除済みの発見）'} · 記録 {new Date(s.fetchedAt).toLocaleDateString('ja-JP')}</p>
                <p className="small muted">{s.url}</p>
              </li>))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
