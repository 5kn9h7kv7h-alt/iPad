import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHead, SectionHead } from '../components/parts';
import { useLucida } from '../store';

export function Profile() {
  const { data, repo, aiAvailable, saveInterest, removeInterest, savePrefs, exportJson, importJson, wipe, say } = useLucida();
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const guard = async (fn: () => Promise<void>) => { setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message || '失敗しました'); } };
  const sorted = [...data.interests].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

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
          <label className="field-label" htmlFor="lim">1日の生成上限<small>AI利用料金の上限にもなります</small></label>
          <select id="lim" value={data.prefs.dailyLimit} onChange={(e) => guard(() => savePrefs({ dailyLimit: Number(e.target.value) }))}>
            {[3, 6, 10, 20].map((n) => <option key={n} value={n}>{n}件</option>)}
          </select>
          <label className="field-label" htmlFor="ai">生成方式<small>{aiAvailable ? 'AIエンドポイントが設定されています' : 'AIは未設定です（ルールベースで動作中）'}</small></label>
          <select id="ai" value={data.prefs.aiMode} onChange={(e) => guard(() => savePrefs({ aiMode: e.target.value as 'auto' | 'rule' }))}>
            <option value="auto">自動（AIが使えるときはAI）</option>
            <option value="rule">ルールベースのみ（費用ゼロ）</option>
          </select>
        </div>
      </section>

      <section>
        <SectionHead en="Data" ja="データ" />
        <p className="small muted">保存先：{repo?.kind === 'indexeddb' ? 'このブラウザ内（IndexedDB）。再起動しても保持されます' : repo?.kind === 'supabase' ? 'Supabase' : 'メモリのみ（この環境では再起動で消えます）'}。個人データはコードに含まれず、外部へ送信されません。</p>
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
        </div>
      </section>
    </div>
  );
}
