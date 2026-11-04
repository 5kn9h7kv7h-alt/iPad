import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Actions, Kicker, PageHead, Row, SectionHead } from '../components/parts';
import { dateKey, formatDateJa, greeting, relTime } from '../domain/util';
import { useLucida } from '../store';

export function Home() {
  const { data, ensureToday, generate, react, say } = useLucida();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);
  const today = dateKey();

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await ensureToday();
      if (r?.notice) setNotice(r.notice);
    } catch (e) {
      console.error(e);
      setError('発見の生成に失敗しました。もう一度お試しください。');
    } finally { setBusy(false); }
  };
  useEffect(() => { if (started.current) return; started.current = true; void run(); /* eslint-disable-next-line */ }, []);

  const todays = useMemo(
    () => data.discoveries.filter((d) => d.generatedFor === today).sort((a, b) => b.scores.total - a.scores.total),
    [data.discoveries, today],
  );
  const [lead, ...rest] = todays;

  const more = async () => {
    setBusy(true);
    try {
      const r = await generate({ count: 1 });
      setNotice(r.notice ?? null);
      if (r.created.length) say('新しい発見を追加しました');
    } catch (e) { console.error(e); setError('発見の生成に失敗しました。'); } finally { setBusy(false); }
  };

  // Life Insights: 手動入力から集計（事実）と傾向（推測）を分けて示す
  const insights = useMemo(() => {
    const week = Date.now() - 7 * 86400000;
    const recentNotes = data.notes.filter((n) => new Date(n.createdAt).getTime() > week);
    const tagCount = new Map<string, number>();
    for (const n of recentNotes) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    const top = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { recent: recentNotes.length, open: data.questions.filter((q) => q.status === 'open').length, top };
  }, [data.notes, data.questions]);

  // Suggested Experiments: 今日の発見・保存・興味ありの「提案」から、まだ予定にしていないもの
  const experiments = useMemo(() => {
    const picks = data.discoveries.filter((d) => {
      const st = { planned: false, saved: false, like: false };
      for (const i of data.interactions.filter((x) => x.discoveryId === d.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (i.kind === 'plan') st.planned = true; if (i.kind === 'unplan') st.planned = false;
        if (i.kind === 'save') st.saved = true; if (i.kind === 'unsave') st.saved = false;
        if (i.kind === 'like') st.like = true; if (i.kind === 'clear_rating' || i.kind === 'dislike') st.like = false;
      }
      return !st.planned && (d.generatedFor === today || st.saved || st.like);
    });
    return picks.sort((a, b) => b.scores.utility - a.scores.utility).slice(0, 3);
  }, [data.discoveries, data.interactions, today]);

  const activity = useMemo(() => {
    const titles = new Map(data.discoveries.map((d) => [d.id, d.title]));
    const label: Record<string, string> = { save: '保存', unsave: '保存を解除', like: '興味ありに', dislike: '興味なしに', clear_rating: '評価を取り消し', plan: '試す予定に追加', unplan: '予定を取り消し' };
    return [
      ...data.interactions.map((i) => ({ at: i.createdAt, id: i.id, text: `「${titles.get(i.discoveryId) ?? '（削除済み）'}」を${label[i.kind]}`, to: `/d/${i.discoveryId}` })),
      ...data.notes.map((n) => ({ at: n.createdAt, id: n.id, text: `記録: ${n.text.slice(0, 28)}`, to: '/archive' })),
      ...data.questions.map((q) => ({ at: q.createdAt, id: q.id, text: `疑問: ${q.text.slice(0, 28)}`, to: '/archive' })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [data]);

  return (
    <div className="page">
      <PageHead kicker={formatDateJa()} title={greeting()}>
        <p className="lede">今日は何を見つけましょう。</p>
        <div className="head-links">
          <Link to="/capture" className="btn primary">記録する</Link>
          <Link to="/profile" className="btn">興味プロフィール</Link>
        </div>
      </PageHead>

      {error && <div className="banner error" role="alert">{error} <button className="link" onClick={run}>再試行</button></div>}
      {notice && <div className="banner" role="status">{notice}</div>}

      <section aria-labelledby="h-today">
        <SectionHead en="Today’s Discovery" ja="今日の発見" />
        {busy && todays.length === 0 && <p className="muted" aria-live="polite">今日の発見を探しています…</p>}
        {!busy && !lead && !error && <p className="empty">今日表示できる発見がありません。<Link to="/profile">興味を追加</Link>すると新しい発見が見つかります。</p>}
        {lead && (
          <article className="lead">
            <Kicker d={lead} />
            <h3 id="h-today" className="lead-title"><Link to={`/d/${lead.id}`}>{lead.title}</Link></h3>
            <p className="lead-fact">{lead.fact}</p>
            <p className="lead-note"><Link to={`/d/${lead.id}`}>考察・提案・出典を読む →</Link></p>
            <Actions d={lead} />
          </article>
        )}
      </section>

      {rest.length > 0 && (
        <section aria-labelledby="h-curiosity">
          <SectionHead en="For Your Curiosity" ja="あなたの好奇心に" />
          <ol className="rows" id="h-curiosity">{rest.map((d, i) => <Row key={d.id} d={d} index={i + 2} />)}</ol>
        </section>
      )}

      <div className="more">
        <button className="btn" onClick={more} disabled={busy}>{busy ? '探しています…' : 'もう1つ見つける'}</button>
        <span className="muted small">今日の生成 {data.usageToday} / {data.prefs.dailyLimit}</span>
      </div>

      <section aria-labelledby="h-insights">
        <SectionHead en="Life Insights" ja="日々の気づき" />
        <div id="h-insights" className="prose">
          {data.notes.length + data.questions.length === 0 ? (
            <p className="muted">疑問・アイデア・日常の記録を残すと、ここに傾向がまとまります。まず<Link to="/capture">ひとつ記録</Link>してみてください。</p>
          ) : (
            <>
              <p><span className="tag fact">集計</span> 直近7日の記録は{insights.recent}件、未解決の疑問は{insights.open}件です。</p>
              {insights.top.length > 0 && (
                <p><span className="tag infer">推測</span> 最近よく出てくるテーマは「{insights.top.map(([t, n]) => `${t}(${n})`).join('、')}」。関心が向いている可能性があります。</p>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="h-exp">
        <SectionHead en="Suggested Experiments" ja="試してみること" />
        {experiments.length === 0 ? <p className="muted">提案はまだありません。発見を保存したり「興味あり」にすると、試せることがここに並びます。</p> : (
          <ul className="exps" id="h-exp">
            {experiments.map((d) => (
              <li key={d.id}>
                <span className="tag suggest">提案</span>
                <p>{d.suggestion}</p>
                <p className="small muted">
                  <Link to={`/d/${d.id}`}>{d.title}</Link>
                  {' · '}
                  <button className="link" onClick={async () => { await react(d.id, 'plan'); say('「試す予定」に追加しました'); }}>試す予定にする</button>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="h-activity">
        <SectionHead en="Recent Activity" ja="最近の動き" aside={<Link to="/archive" className="small">Archiveへ</Link>} />
        {activity.length === 0 ? <p className="muted">まだ動きはありません。</p> : (
          <ul className="log" id="h-activity">
            {activity.map((a) => <li key={a.id}><time>{relTime(a.at)}</time><Link to={a.to}>{a.text}</Link></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
