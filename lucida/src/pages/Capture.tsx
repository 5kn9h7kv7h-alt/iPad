import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHead } from '../components/parts';
import { useLucida, type EntryKind } from '../store';

const KINDS: { id: EntryKind; label: string; hint: string }[] = [
  { id: 'question', label: '疑問', hint: '気になったこと、答えを知りたいこと' },
  { id: 'interest', label: '興味', hint: '興味のあるテーマ（短い言葉で）' },
  { id: 'idea', label: 'アイデア', hint: '思いついたこと' },
  { id: 'insight', label: '気づき', hint: '分かったこと、腑に落ちたこと' },
  { id: 'log', label: '日常の記録', hint: '今日の出来事、体調、行動' },
];

export function Capture() {
  const { addEntry, data } = useLucida();
  const [kind, setKind] = useState<EntryKind>('question');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = KINDS.find((k) => k.id === kind)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const { inferred } = await addEntry(kind, text);
      setText('');
      setStatus({ ok: true, msg: `保存しました。${inferred.length ? `関連するテーマ「${inferred.join('、')}」を興味プロフィールに推定として追加しました（編集・削除できます）。` : ''}` });
    } catch (err) {
      setStatus({ ok: false, msg: (err as Error).message || '保存に失敗しました' });
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHead kicker="Capture" title="記録する">
        <p className="lede">書いた内容は、この端末の中に保存されます。</p>
      </PageHead>
      <form onSubmit={submit} className="form">
        <div className="seg" role="radiogroup" aria-label="種類">
          {KINDS.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
        <label htmlFor="body" className="field-label">{cur.label}<small>{cur.hint}</small></label>
        <textarea id="body" rows={kind === 'interest' ? 2 : 6} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} required />
        <div className="form-foot">
          <button className="btn primary" type="submit" disabled={busy || !text.trim()}>{busy ? '保存中…' : '保存する'}</button>
          <Link to="/archive" className="small">記録を見る（{data.notes.length + data.questions.length}件）</Link>
        </div>
        {status && <p role={status.ok ? 'status' : 'alert'} className={`banner${status.ok ? '' : ' error'}`}>{status.msg}</p>}
      </form>
    </div>
  );
}
