import { useState } from 'react';
import { useLucida } from '../store';

/** Supabase バックエンドを使うときだけ表示されるサインイン画面（ローカル保存では出ない）。 */
export function SignIn() {
  const { signIn, signUp } = useLucida();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'in') await signIn(email.trim(), password);
      else {
        const r = await signUp(email.trim(), password);
        if (r.needsConfirmation) setMsg({ ok: true, text: '確認メールを送りました。メール内のリンクを開いてから、サインインしてください。' });
      }
    } catch (err) { setMsg({ ok: false, text: (err as Error).message || 'サインインに失敗しました' }); } finally { setBusy(false); }
  };

  return (
    <main className="boot signin">
      <h1 className="wordmark">LUCIDA</h1>
      <p className="muted">クラウド保存を使うには、サインインが必要です。</p>
      <form className="form" onSubmit={submit}>
        <label className="field-label" htmlFor="si-email">メールアドレス</label>
        <input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="field-label" htmlFor="si-pass">パスワード</label>
        <input id="si-pass" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '処理中…' : mode === 'in' ? 'サインイン' : 'アカウントを作成'}</button>
        <button className="link" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'はじめての方：アカウントを作成' : 'アカウントをお持ちの方：サインイン'}
        </button>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`banner${msg.ok ? '' : ' error'}`}>{msg.text}</p>}
      </form>
    </main>
  );
}
