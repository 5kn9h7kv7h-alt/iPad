import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SectionHead } from '../components/parts';
import { OUTCOME_JA, type Outcome } from '../domain/types';
import { dateKey } from '../domain/util';
import { addLog, addResultToNetwork, completeExperiment, removeExperiment, removeLog, reopenExperiment, runAnalysis, updateExperiment } from '../lab/actions';
import { useLucida } from '../store';

const STATUS_JA = { planned: '予定', running: '進行中', done: '完了' } as const;

export function ExperimentDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { data, mutate, say, analyzeEndpoint, aiHeaders } = useLucida();
  const exp = data.experiments.find((e) => e.id === id);
  const logs = useMemo(() => data.experimentLogs.filter((l) => l.experimentId === id).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt)), [data.experimentLogs, id]);
  const today = dateKey();
  const [log, setLog] = useState({ day: today, did: true, rating: '', text: '' });
  const [result, setResult] = useState<{ outcome: Outcome; text: string }>({ outcome: exp?.outcome ?? 'supported', text: exp?.result ?? '' });
  const [editResult, setEditResult] = useState(false);
  const [edit, setEdit] = useState(exp ? { title: exp.title, hypothesis: exp.hypothesis, plan: exp.plan, startsOn: exp.startsOn, endsOn: exp.endsOn } : null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!exp || !edit) {
    return <div className="page"><p className="empty">この実験は見つかりませんでした。</p><button className="btn" onClick={() => nav('/lab')}>Labへ</button></div>;
  }
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try { await fn(); if (ok) say(ok); return true; } catch (e) { console.error(e); setError((e as Error).message || '保存に失敗しました'); return false; }
  };
  const source = exp.discoveryId ? data.discoveries.find((d) => d.id === exp.discoveryId) : undefined;
  const a = exp.aiAnalysis;
  const showResultForm = exp.status !== 'done' || editResult;

  return (
    <article className="page detail">
      <Link to="/lab" className="link back">← Lab</Link>
      <p className="kicker"><span>{STATUS_JA[exp.status]}</span><span className="dot">·</span><span>{exp.startsOn} 〜 {exp.endsOn}</span></p>
      <h1 className="page-title">{exp.title}</h1>
      {error && <p role="alert" className="banner error">{error}</p>}

      <section>
        <h2 className="label"><span>仮説</span></h2>
        <p className="body-serif">{exp.hypothesis || '（未記入）'}</p>
        <h2 className="label plan-label"><span>行動計画</span></h2>
        <p className="body-serif">{exp.plan || '（未記入）'}</p>
        {source && <p className="note">きっかけの発見：<Link to={`/d/${source.id}`}>{source.title}</Link></p>}
        <details className="why">
          <summary>内容・期間を編集する</summary>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void run(() => mutate((repo) => updateExperiment(repo, exp.id, edit)), '保存しました'); }}>
            <label className="field-label" htmlFor="e-title">実験の名前</label>
            <input id="e-title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={80} required />
            <label className="field-label" htmlFor="e-hyp">仮説</label>
            <textarea id="e-hyp" rows={2} value={edit.hypothesis} onChange={(e) => setEdit({ ...edit, hypothesis: e.target.value })} maxLength={500} />
            <label className="field-label" htmlFor="e-plan">行動計画</label>
            <textarea id="e-plan" rows={2} value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })} maxLength={500} />
            <div className="two">
              <label className="field-label" htmlFor="e-from">開始日<input id="e-from" type="date" value={edit.startsOn} onChange={(e) => setEdit({ ...edit, startsOn: e.target.value })} required /></label>
              <label className="field-label" htmlFor="e-to">終了日<input id="e-to" type="date" value={edit.endsOn} onChange={(e) => setEdit({ ...edit, endsOn: e.target.value })} required /></label>
            </div>
            <div className="form-foot"><button className="btn" type="submit">変更を保存</button></div>
          </form>
        </details>
      </section>

      <section>
        <SectionHead en="Log" ja={`実施記録 ${logs.length}件`} />
        <form className="form" aria-label="実施記録の追加" onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await mutate((repo) => addLog(repo, exp.id, { day: log.day, did: log.did, rating: log.rating ? Number(log.rating) : undefined, text: log.text }));
            setLog({ ...log, text: '', rating: '' });
          }, '記録しました');
        }}>
          <div className="two">
            <label className="field-label" htmlFor="l-day">日付<input id="l-day" type="date" value={log.day} onChange={(e) => setLog({ ...log, day: e.target.value })} required /></label>
            <label className="field-label" htmlFor="l-rating">手応え（任意）
              <select id="l-rating" value={log.rating} onChange={(e) => setLog({ ...log, rating: e.target.value })}>
                <option value="">つけない</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}（{['ない', '少し', 'ふつう', 'ある', '強い'][n - 1]}）</option>)}
              </select>
            </label>
          </div>
          <div className="seg" role="radiogroup" aria-label="実施したか">
            <button type="button" role="radio" aria-checked={log.did} aria-pressed={log.did} className="chip" onClick={() => setLog({ ...log, did: true })}>できた</button>
            <button type="button" role="radio" aria-checked={!log.did} aria-pressed={!log.did} className="chip" onClick={() => setLog({ ...log, did: false })}>できなかった</button>
          </div>
          <label className="field-label" htmlFor="l-text">メモ（任意）</label>
          <input id="l-text" value={log.text} onChange={(e) => setLog({ ...log, text: e.target.value })} maxLength={500} placeholder="気づいたこと、できなかった理由など" />
          <div className="form-foot"><button className="btn primary" type="submit">記録する</button></div>
        </form>
        {logs.length > 0 && (
          <ul className="log exp-logs">
            {logs.map((l) => (
              <li key={l.id}>
                <time>{l.day.slice(5).replace('-', '/')}</time>
                <span>{l.did ? 'できた' : 'できなかった'}{l.rating ? ` · 手応え ${l.rating}` : ''}{l.text ? ` · ${l.text}` : ''}</span>
                <button className="link danger" onClick={() => run(() => mutate((repo) => removeLog(repo, l.id)))} aria-label={`${l.day} の記録を削除`}>削除</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHead en="Result" ja="結果" />
        {exp.status === 'done' && !editResult && (
          <>
            <p><span className="tag fact">自己評価</span>{exp.outcome ? OUTCOME_JA[exp.outcome] : ''}</p>
            <p className="body-serif">{exp.result}</p>
            <p className="small">
              <button className="link" onClick={() => { setResult({ outcome: exp.outcome ?? 'supported', text: exp.result ?? '' }); setEditResult(true); }}>結果を書き直す</button>
              {' · '}<button className="link" onClick={() => run(() => mutate((repo) => reopenExperiment(repo, exp.id)), '進行中に戻しました')}>進行中に戻す</button>
            </p>
          </>
        )}
        {showResultForm && (
          <form className="form" aria-label="結果の入力" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => { await mutate((repo) => completeExperiment(repo, exp.id, { outcome: result.outcome, result: result.text })); setEditResult(false); }, '結果を保存しました');
          }}>
            <div className="seg" role="radiogroup" aria-label="仮説の評価">
              {(Object.keys(OUTCOME_JA) as Outcome[]).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={result.outcome === o} aria-pressed={result.outcome === o} className="chip" onClick={() => setResult({ ...result, outcome: o })}>{OUTCOME_JA[o]}</button>
              ))}
            </div>
            <label className="field-label" htmlFor="r-text">結果<small>何が起きたか、どう感じたか</small></label>
            <textarea id="r-text" rows={3} value={result.text} onChange={(e) => setResult({ ...result, text: e.target.value })} maxLength={1000} required />
            <div className="form-foot"><button className="btn primary" type="submit" disabled={!result.text.trim()}>結果を保存して完了にする</button></div>
          </form>
        )}
      </section>

      <section>
        <SectionHead en="Analysis" ja="分析" />
        {notice && <p className="banner" role="status">{notice}</p>}
        {a ? (
          <div className="analysis">
            <h3 className="label"><span className="tag fact">集計</span><span>記録から数えた事実</span></h3>
            <ul className="bullets">{a.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            {a.inferences.length > 0 && <>
              <h3 className="label"><span className="tag infer">推測</span><span>確かめられていない読み取り</span></h3>
              <ul className="bullets">{a.inferences.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </>}
            {a.nextSteps.length > 0 && <>
              <h3 className="label"><span className="tag suggest">提案</span><span>次に試せること</span></h3>
              <ul className="bullets">{a.nextSteps.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </>}
            <p className="small muted">{a.caveat}</p>
            <p className="small muted">{a.provider === 'remote-ai' ? '推測と提案はAIが作成（集計は端末内で計算）' : 'ルールベースで作成（外部への送信なし）'} · {new Date(a.createdAt).toLocaleDateString('ja-JP')}</p>
          </div>
        ) : <p className="muted">記録と結果をもとに、事実・推測・提案を分けてまとめます。</p>}
        <div className="more">
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setNotice(null);
            await run(async () => {
              const headers = await aiHeaders();
              const useAi = !!analyzeEndpoint && data.prefs.aiMode === 'auto';
              const r = await mutate((repo) => runAnalysis(repo, exp.id, { endpoint: useAi ? analyzeEndpoint : null, headers }));
              if (r.notice) setNotice(r.notice);
            });
            setBusy(false);
          }}>{busy ? '分析しています…' : a ? '分析し直す' : '分析する'}</button>
        </div>
      </section>

      <section>
        <SectionHead en="Network" ja="知識のつながりへ" />
        {exp.status === 'done' ? (
          <>
            <p className="muted">結果を「気づき」としてKnowledge Networkに加え、この実験と結びます。</p>
            <div className="more">
              <button className="btn" onClick={() => run(() => mutate((repo) => addResultToNetwork(repo, exp.id)), '結果をNetworkに追加しました')}>結果をNetworkに追加する</button>
              <Link to="/network" className="small">Networkを見る →</Link>
            </div>
          </>
        ) : <p className="muted">結果を入力すると、Knowledge Networkに加えられます。</p>}
      </section>

      <p className="small danger-zone">
        <button className="link danger" onClick={() => {
          if (!confirm('この実験と実施記録を削除します。元に戻せません。よろしいですか？')) return;
          void (async () => { if (await run(() => mutate((repo) => removeExperiment(repo, exp.id)), '実験を削除しました')) nav('/lab'); })();
        }}>この実験を削除</button>
      </p>
    </article>
  );
}
