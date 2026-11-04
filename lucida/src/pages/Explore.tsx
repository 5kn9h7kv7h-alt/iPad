import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { matchesKeyword } from '../ai/ruleBased';
import { CATALOG } from '../ai/catalog';
import { crossFieldPairs } from '../ai/crossField';
import { Link } from 'react-router-dom';
import { PageHead, Row, SectionHead } from '../components/parts';
import { CATEGORIES, CATEGORY_JA, type Category } from '../domain/types';
import { useLucida } from '../store';

export function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const cat = (CATEGORIES.find((c) => c === params.get('c')) ?? null) as Category | null;
  const [text, setText] = useState(q);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data, generate, say, aiAvailable } = useLucida();

  const set = (next: { q?: string; c?: Category | null }) => {
    const p = new URLSearchParams(params);
    if (next.q !== undefined) next.q ? p.set('q', next.q) : p.delete('q');
    if (next.c !== undefined) next.c ? p.set('c', next.c) : p.delete('c');
    setParams(p, { replace: true });
    setMessage(null);
  };

  const found = useMemo(
    () => data.discoveries.filter((d) => (!cat || d.category === cat) && (!q || matchesKeyword({ ...d, sources: [], reasoning: '', suggestion: '', sourceKey: '' }, q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.discoveries, cat, q],
  );

  // 関連テーマ: 条件に合うカタログ項目のタグから、入力語以外の頻出タグを提案（ルールベース）
  const themes = useMemo(() => {
    const pool = CATALOG.filter((c) => (!cat || c.category === cat) && (!q || matchesKeyword(c, q)));
    const count = new Map<string, number>();
    for (const c of pool) for (const t of c.tags) if (t.toLowerCase() !== q.toLowerCase()) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [cat, q]);

  const pairs = useMemo(() => crossFieldPairs(data.discoveries), [data.discoveries]);

  const discover = async () => {
    setBusy(true); setMessage(null);
    try {
      const r = await generate({ count: 3, category: cat ?? undefined, keyword: q || undefined, web: true });
      setMessage(r.created.length ? `${r.created.length}件の新しい発見を追加しました。` : r.notice ?? '新しい発見はありませんでした。');
      if (r.created.length && r.notice) say(r.notice);
    } catch (e) { console.error(e); setMessage('発見の生成に失敗しました。もう一度お試しください。'); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHead kicker="Explore" title="探索する">
        <p className="lede">キーワードや分野から、まだ見ていない発見を探します。</p>
      </PageHead>

      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }}>
        <label className="sr" htmlFor="q">キーワード</label>
        <input id="q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="例：睡眠、宇宙、言語" />
        <button className="btn primary" type="submit">検索</button>
      </form>

      <div className="chips" role="group" aria-label="カテゴリ">
        <button className="chip" aria-pressed={!cat} onClick={() => set({ c: null })}>すべて</button>
        {CATEGORIES.map((c) => (
          <button key={c} className="chip" aria-pressed={cat === c} onClick={() => set({ c })}>{c}<small>{CATEGORY_JA[c]}</small></button>
        ))}
      </div>
      {cat === 'Unknown' && <p className="note">Unknown は、普段の興味から離れたテーマを優先して選びます。</p>}

      {themes.length > 0 && (
        <section>
          <SectionHead en="Related Themes" ja="関連テーマ" />
          <p className="chips">{themes.map((t) => <button key={t} className="chip" onClick={() => { setText(t); set({ q: t }); }}>{t}</button>)}</p>
        </section>
      )}

      {pairs.length > 0 && (
        <section>
          <SectionHead en="Cross Fields" ja="異分野の組み合わせ" />
          <ul className="exps">
            {pairs.map((p) => (
              <li key={p.a.id + p.b.id}>
                <span className="tag infer">推測</span>
                <p>{p.text}</p>
                <p className="small muted"><Link to={`/d/${p.a.id}`}>{p.a.title}</Link> × <Link to={`/d/${p.b.id}`}>{p.b.title}</Link></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-live="polite">
        <SectionHead en="Results" ja={`見つけた発見 ${found.length}件`} />
        {found.length === 0 ? <p className="empty">この条件で、まだ見た発見はありません。</p> : <ol className="rows">{found.map((d) => <Row key={d.id} d={d} />)}</ol>}
        <div className="more">
          <button className="btn primary" onClick={discover} disabled={busy}>{busy ? '探しています…' : `${q || cat ? 'この条件で' : ''}新しく見つける`}</button>
          <span className="muted small">今日の生成 {data.usageToday} / {data.prefs.dailyLimit}{data.prefs.webSearch && aiAvailable ? ' · Web検索: 許可済み' : ''}</span>
        </div>
        {message && <p className="banner" role="status">{message}</p>}
      </section>
    </div>
  );
}
