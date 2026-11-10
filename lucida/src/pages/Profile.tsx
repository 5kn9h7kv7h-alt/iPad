import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { effectiveTarget } from '../ai/frequency';
import { adaptWeights, categoryShares } from '../ai/scoring';
import { PageHead, SectionHead } from '../components/parts';
import { CATEGORIES, CATEGORY_JA } from '../domain/types';
import { INTEGRATIONS, type IntegrationId } from '../integrations';
import { importFromIntegration, removeImported } from '../integrations/actions';
import { useLucida } from '../store';

const WEIGHT_JA: Record<string, string> = { interest: '興味との関連', novelty: '新規性', utility: '実用性', timing: 'タイミング', diversity: '多様性' };

export function Profile() {
  const { data, repo, aiAvailable, analyzeEndpoint, userEmail, saveInterest, removeInterest, savePrefs, exportJson, importJson, wipe, say, mutate, signOut } = useLucida();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const file = useRef<HTMLInputElement>(null);
  const integrationFile = useRef<HTMLInputElement>(null);
  const pendingIntegration = useRef<IntegrationId | null>(null);
  const guard = async (fn: () => Promise<void>) => { setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message || '失敗しました'); } };
  const sorted = [...data.interests].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  const decision = useMemo(() => effectiveTarget(data.prefs, data.discoveries, data.interactions, new Date()), [data.prefs, data.discoveries, data.interactions]);
  const recent = useMemo(() => [...data.discoveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30), [data.discoveries]);
  const shares = useMemo(() => categoryShares(recent), [recent]);

  const runImport = async (id: IntegrationId, text: string) => {
    try {
      const r = await mutate((repo) => importFromIntegration(repo, id, text));
      const parts = [`${r.added}件を取り込みました。`];
      if (r.duplicates) parts.push(`取り込み済みの${r.duplicates}件は飛ばしました。`);
      if (r.skipped) parts.push(`読めなかった行・対象外が${r.skipped}件ありました。`);
      if (r.inferred.length) parts.push(`よく出てくるテーマ「${r.inferred.join('、')}」を興味に推定として追加しました。`);
      setImportMsg((m) => ({ ...m, [id]: { ok: true, text: [...parts, ...r.remarks].join(' ') } }));
    } catch (e) {
      setImportMsg((m) => ({ ...m, [id]: { ok: false, text: (e as Error).message || '取り込みに失敗しました' } }));
    }
  };

  return (
    <div className="page">
      <Link to="/" className="link back">← ホーム</Link>
      <PageHead kicker="Profile" title="興味プロフィール">
        <p className="lede">ここに書いた興味が、発見の選び方に反映されます。重みが大きいほど優先されます。</p>
      </PageHead>
      {err && <p role="alert" className="banner error">{err}</p>}

      <section>
        <SectionHead en="Interests" ja={`${data.interests.length}件`} />
        <form className="search" onSubmit={(e) => { e.preventDefault(); void guard(async () => { await saveInterest({ name }); setName(''); say('興味を追加しました'); }); }}>
          <label className="sr" htmlFor="newi">興味の名前</label>
          <input id="newi" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：睡眠、宇宙、言語" maxLength={40} />
          <button className="btn primary" type="submit" disabled={!name.trim()}>追加</button>
        </form>
        {sorted.length === 0 ? <p className="empty">まだ興味が登録されていません。ひとつ追加すると、発見がそれに合わせて選ばれます。</p> : (
          <ul className="interests">
            {sorted.map((i) => (
              <li key={i.id}>
                <span className="i-name">{i.name}{i.origin === 'inferred' && <small className="tag infer">推定</small>}</span>
                <label className="sr" htmlFor={`w-${i.id}`}>{i.name} の重み</label>
                <select id={`w-${i.id}`} value={i.weight} onChange={(e) => guard(() => saveInterest({ id: i.id, name: i.name, weight: Number(e.target.value) as 1 }))}>
                  {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>重み {w}</option>)}
                </select>
                <button className="link danger" onClick={() => guard(() => removeInterest(i.id))} aria-label={`${i.name} を削除`}>削除</button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">AIに送る要約（全履歴の代わりに使います）：</p>
        <p className="summary">{data.prefs.profileSummary || '（興味が登録されると作られます）'}</p>
      </section>

      <section>
        <SectionHead en="Settings" ja="生成と費用" />
        <div className="form">
          <label className="field-label" htmlFor="tgt">Homeに出す発見の数（1日）</label>
          <select id="tgt" value={data.prefs.dailyTarget} onChange={(e) => guard(() => savePrefs({ dailyTarget: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}件</option>)}
          </select>
          <label className="field-label" htmlFor="freq">提案数の決め方<small>自動調整では、直近7日の反応に合わせて1件だけ増減します</small></label>
          <select id="freq" value={data.prefs.frequencyMode} onChange={(e) => guard(() => savePrefs({ frequencyMode: e.target.value as 'adaptive' | 'fixed' }))}>
            <option value="adaptive">自動調整（Adaptive）</option>
            <option value="fixed">固定</option>
          </select>
          <p className="summary" id="freq-now">いまの提案数：{decision.target}件（{decision.reason}）</p>
          <label className="field-label" htmlFor="lim">1日の生成上限<small>AI利用料金の上限にもなります</small></label>
          <select id="lim" value={data.prefs.dailyLimit} onChange={(e) => guard(() => savePrefs({ dailyLimit: Number(e.target.value) }))}>
            {[3, 6, 10, 20].map((n) => <option key={n} value={n}>{n}件</option>)}
          </select>
          <label className="field-label" htmlFor="ai">生成方式<small>{aiAvailable ? 'AIエンドポイントが設定されています' : 'AIは未設定です（ルールベースで動作中）'}{analyzeEndpoint ? '・実験の分析にもAIを使えます' : ''}</small></label>
          <select id="ai" value={data.prefs.aiMode} onChange={(e) => guard(() => savePrefs({ aiMode: e.target.value as 'auto' | 'rule' }))}>
            <option value="auto">自動（AIが使えるときはAI）</option>
            <option value="rule">ルールベースのみ（費用ゼロ）</option>
          </select>
          <label className="field-label" htmlFor="web">外部情報（Web検索）<small>
            {aiAvailable ? '許可すると、探索・関連発見の検索で、キーワードと要約プロフィールがAI中継サーバー経由で外部に送られます。自動生成では使いません。' : 'AIエンドポイント未設定のため、いまは使われません（設定しても外部へは送信されません）。'}</small></label>
          <select id="web" value={data.prefs.webSearch ? 'on' : 'off'} onChange={(e) => guard(() => savePrefs({ webSearch: e.target.value === 'on' }))}>
            <option value="off">許可しない（既定）</option>
            <option value="on">許可する</option>
          </select>
        </div>
        <p className="small muted">いまの選び方の重み（反応に応じて自動で調整されます）：</p>
        <p className="summary">{Object.entries(adaptWeights(data.interactions)).map(([k, v]) => `${WEIGHT_JA[k] ?? k} ${Math.round(v * 100)}%`).join(' / ')}</p>
      </section>

      <section>
        <SectionHead en="Balance" ja="分野のバランス" />
        {recent.length === 0 ? <p className="muted">発見が増えると、分野ごとの割合がここに出ます。</p> : (
          <>
            <p className="small muted">直近{recent.length}件の発見の内訳です。多く出ている分野は次回から少し控えめに、少ない分野は出やすくなります。</p>
            <dl className="shares">
              {CATEGORIES.map((c) => {
                const pct = Math.round((shares[c] ?? 0) * 100);
                return <div key={c}><dt>{c}<small>{CATEGORY_JA[c]}</small></dt><dd><span className="bar"><i style={{ width: `${pct}%` }} /></span><span className="n">{pct}%</span></dd></div>;
              })}
            </dl>
          </>
        )}
      </section>

      <section>
        <SectionHead en="Integrations" ja="外部の記録を取り込む" />
        <p className="small muted">連携は、ここで「許可する」にしたものだけが使えます。ファイルはこの端末の中で読み取り、外部へ送信しません。</p>
        <input ref={integrationFile} type="file" hidden data-testid="integration-file" onChange={(e) => {
          const f = e.target.files?.[0]; const id = pendingIntegration.current; e.target.value = '';
          if (f && id) void f.text().then((t) => runImport(id, t));
        }} />
        <ul className="integrations">
          {INTEGRATIONS.map((it) => {
            const allowed = data.prefs.integrations[it.id] === true;
            const count = data.notes.filter((n) => n.source === it.id).length;
            const msg = importMsg[it.id];
            return (
              <li key={it.id} data-integration={it.id}>
                <h3 className="i-name">{it.name}</h3>
                <p className="small">{it.description}</p>
                <p className="small muted">{it.disclosure}</p>
                <label className="sr" htmlFor={`int-${it.id}`}>{it.name} の許可</label>
                <select id={`int-${it.id}`} value={allowed ? 'on' : 'off'} onChange={(e) => guard(() => savePrefs({ integrations: { ...data.prefs.integrations, [it.id]: e.target.value === 'on' } }))}>
                  <option value="off">許可しない</option>
                  <option value="on">許可する</option>
                </select>
                <div className="head-links">
                  <button className="btn" disabled={!allowed} onClick={() => {
                    pendingIntegration.current = it.id;
                    if (integrationFile.current) { integrationFile.current.accept = it.accept; integrationFile.current.click(); }
                  }}>ファイルを選んで取り込む</button>
                  {count > 0 && (
                    <button className="link danger" onClick={() => {
                      if (confirm(`${it.name}から取り込んだ${count}件の記録を削除します。よろしいですか？`)) void guard(async () => { const n = await mutate((repo) => removeImported(repo, it.id)); say(`${n}件の記録を削除しました`); setImportMsg((m) => ({ ...m, [it.id]: { ok: true, text: '取り込んだ記録を削除しました。' } })); });
                    }}>取り込んだ{count}件を削除</button>
                  )}
                </div>
                {msg && <p role={msg.ok ? 'status' : 'alert'} className={`banner${msg.ok ? '' : ' error'}`}>{msg.text}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionHead en="Data" ja="データ" />
        <p className="small muted">保存先：{repo?.kind === 'indexeddb' ? 'このブラウザ内（IndexedDB）。再起動しても保持されます' : repo?.kind === 'supabase' ? `Supabase（${userEmail ?? ''}）` : 'メモリのみ（この環境では再起動で消えます）'}。個人データはコードに含まれません。</p>
        <div className="head-links">
          <button className="btn" onClick={() => guard(async () => {
            const url = URL.createObjectURL(new Blob([await exportJson()], { type: 'application/json' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: `lucida-backup-${new Date().toISOString().slice(0, 10)}.json` });
            a.click(); URL.revokeObjectURL(url);
          })}>書き出し（JSON）</button>
          <button className="btn" onClick={() => file.current?.click()}>読み込み</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) void guard(async () => { await importJson(await f.text()); say('バックアップを読み込みました'); });
          }} />
          <button className="btn danger" onClick={() => { if (confirm('すべてのデータを削除します。元に戻せません。よろしいですか？')) void guard(async () => { await wipe(); say('すべてのデータを削除しました'); }); }}>全データを削除</button>
          {userEmail && <button className="btn" onClick={() => guard(() => signOut())}>サインアウト</button>}
        </div>
      </section>
    </div>
  );
}
