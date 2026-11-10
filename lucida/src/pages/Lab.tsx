import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { computeStats } from '../ai/analysis';
import { PageHead, SectionHead } from '../components/parts';
import { OUTCOME_JA, type Experiment } from '../domain/types';
import { dateKey } from '../domain/util';
import { createExperiment, type ExperimentInput } from '../lab/actions';
import { useLucida } from '../store';

const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return dateKey(new Date(y, m - 1, d + n)); };
const STATUS_JA = { planned: '予定', running: '進行中', done: '完了' } as const;

export function Lab() {
  const { data, stateOf, react, mutate, say } = useLucida();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = dateKey();
  const blank: ExperimentInput = { title: '', hypothesis: '', plan: '', startsOn: today, endsOn: addDays(today, 6) };
  const [form, setForm] = useState<ExperimentInput>(blank);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const prefill = (discoveryId: string) => {
    const d = data.discoveries.find((x) => x.id === discoveryId);
    if (!d) return;
    setForm({ ...blank, title: d.title.slice(0, 80), plan: d.suggestion, discoveryId: d.id });
    setOpen(true); setError(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  // 発見の「実験にする」から来たとき（/lab?from=<id>）
  const from = params.get('from');
  useEffect(() => { if (from) { prefill(from); setParams({}, { replace: true }); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from]);

  const seeds = useMemo(() => data.discoveries.filter((d) => stateOf(d.id).planned).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.discoveries, stateOf]);
  const groups = useMemo(() => {
    const sorted = [...data.experiments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (['running', 'planned', 'done'] as const).map((s) => [s, sorted.filter((e) => e.status === s)] as const);
  }, [data.experiments]);
  const source = form.discoveryId ? data.discoveries.find((d) => d.id === form.discoveryId) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const exp = await mutate((repo) => createExperiment(repo, form));
      say('実験を作成しました');
      nav(`/lab/${exp.id}`);
    } catch (err) { setError((err as Error).message || '保存に失敗しました'); } finally { setBusy(false); }
  };

  const row = (e: Experiment) => {
    const s = computeStats(e, data.experimentLogs.filter((l) => l.experimentId === e.id), today);
    return (
      <li key={e.id} className="row">
        <div className="row-body">
          <p className="kicker"><span>{STATUS_JA[e.status]}</span><span className="dot">·</span><span>{e.startsOn} 〜 {e.endsOn}</span></p>
          <h3 className="row-title"><Link to={`/lab/${e.id}`}>{e.title}</Link></h3>
          <p className="row-fact">{e.hypothesis ? `仮説: ${e.hypothesis}` : '仮説は未記入'}</p>
          <p className="small muted">
            記録 {s.logCount}件{s.adherence !== null && s.logCount > 0 && ` · 実施率 ${Math.round(s.adherence * 100)}%`}
            {e.outcome && ` · ${OUTCOME_JA[e.outcome]}`}{e.aiAnalysis && ' · 分析あり'}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <PageHead kicker="Lab" title="試してみる">
        <p className="lede">仮説を立て、期間を決めて試し、記録から振り返ります。</p>
        <div className="head-links">
          <button className="btn primary" onClick={() => { setForm(blank); setOpen(true); setError(null); }}>新しい実験を作る</button>
        </div>
      </PageHead>

      {open && (
        <form className="form exp-form" onSubmit={submit} onChange={() => setError(null)} ref={formRef} aria-label="実験の作成">
          {source && <p className="note">きっかけの発見：<Link to={`/d/${source.id}`}>{source.title}</Link></p>}
          <label className="field-label" htmlFor="x-title">実験の名前</label>
          <input id="x-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} required />
          <label className="field-label" htmlFor="x-hyp">仮説<small>「〜すると、〜になるはず」の形で書くと振り返りやすくなります</small></label>
          <textarea id="x-hyp" rows={2} value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} maxLength={500} placeholder="例：朝に15分歩くと、午前中の集中が続く" />
          <label className="field-label" htmlFor="x-plan">行動計画<small>いつ・何を・どのくらい</small></label>
          <textarea id="x-plan" rows={2} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} maxLength={500} />
          <div className="two">
            <label className="field-label" htmlFor="x-from">開始日<input id="x-from" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} required /></label>
            <label className="field-label" htmlFor="x-to">終了日<input id="x-to" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} required /></label>
          </div>
          <div className="form-foot">
            <button className="btn primary" type="submit" disabled={busy || !form.title.trim()}>{busy ? '作成中…' : '実験を始める'}</button>
            <button className="link" type="button" onClick={() => setOpen(false)}>やめる</button>
          </div>
          {error && <p role="alert" className="banner error">{error}</p>}
        </form>
      )}

      {seeds.length > 0 && (
        <section>
          <SectionHead en="Seeds" ja={`試す予定 ${seeds.length}件`} />
          <ul className="exps">
            {seeds.map((d) => (
              <li key={d.id}>
                <span className="tag suggest">提案</span>
                <p>{d.suggestion}</p>
                <p className="small muted">
                  <Link to={`/d/${d.id}`}>{d.title}</Link>
                  {' · '}<button className="link" onClick={() => prefill(d.id)}>実験にする</button>
                  {' · '}<button className="link" onClick={() => react(d.id, 'unplan')}>予定を外す</button>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.experiments.length === 0 && seeds.length === 0 && !open && (
        <p className="empty">まだ実験はありません。発見の「試してみる」を押すか、上の「新しい実験を作る」から始められます。</p>
      )}
      {groups.map(([status, list]) => list.length > 0 && (
        <section key={status}>
          <SectionHead en={status === 'running' ? 'Running' : status === 'planned' ? 'Planned' : 'Done'} ja={`${STATUS_JA[status]} ${list.length}件`} />
          <ol className="rows">{list.map(row)}</ol>
        </section>
      ))}
    </div>
  );
}
