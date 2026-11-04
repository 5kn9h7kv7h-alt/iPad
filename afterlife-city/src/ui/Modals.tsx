import { useEffect, useState } from 'react';
import { useGame, useWorld } from '../store/game';
import { requestDocumentary } from '../ai/service';
import { documentaryFallback, type Documentary } from '../ai/documentary';
import { CATEGORY_LABEL } from '../sim/types';
import { sim } from '../store/game';
import { stamp } from './common';

export function DigestModal() {
  const w = useWorld();
  const digest = useGame(s => s.digest);
  const setDigest = useGame(s => s.setDigest);
  if (!digest) return null;
  const days = digest.simulated / 1440;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-label="留守中の出来事">
      <div className="glass-solid fade-up max-h-[80dvh] w-full max-w-md overflow-hidden rounded-3xl">
        <div className="border-b border-white/10 p-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">OFFSCREEN LIFE</div>
          <h2 className="mt-1 text-lg font-semibold">あなたが見ていない間に</h2>
          <p className="mt-1 text-xs text-slate-400">街では{days >= 1 ? `${days.toFixed(1)}日` : `${Math.round(digest.simulated / 60)}時間`}が過ぎました。</p>
        </div>
        <ul className="scroll-y max-h-[50dvh] space-y-3 p-5">
          {digest.events.map(e => (
            <li key={e.id} className="text-sm"><div className="text-[11px] text-slate-500">{stamp(w, e.time)} · {CATEGORY_LABEL[e.category]}</div>{e.summary}</li>
          ))}
        </ul>
        <div className="p-4"><button onClick={() => setDigest(null)} className="w-full rounded-xl bg-white py-2.5 text-sm font-medium text-slate-900">街へ戻る</button></div>
      </div>
    </div>
  );
}

export function DocumentaryModal() {
  const id = useGame(s => s.documentaryFor);
  const close = useGame(s => s.openDocumentary);
  const aiOn = useGame(s => s.aiEnabled && s.aiStatus.enabled);
  const [doc, setDoc] = useState<Documentary | null>(null);
  useEffect(() => {
    if (!id) { setDoc(null); return; }
    let live = true;
    setDoc(documentaryFallback(sim.world, id));
    if (aiOn) requestDocumentary(sim.world, id).then(d => { if (live) setDoc(d); });
    return () => { live = false; };
  }, [id, aiOn]);
  if (!id || !doc) return null;
  const c = sim.world.citizens[id];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="LIFE DOCUMENTARY">
      <div className="fade-up max-h-[88dvh] w-full max-w-lg overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-black p-6">
        <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">LIFE DOCUMENTARY</div>
        <h2 className="mt-2 font-serif text-2xl leading-snug">{doc.title}</h2>
        <div className="scroll-y mt-4 max-h-[55dvh] space-y-4 font-serif text-[15px] leading-8 text-slate-200">
          {doc.paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>{c?.name} · {doc.source === 'ai' ? 'AIが記録をもとに構成' : '記録にもとづく要約'}</span>
          <button onClick={() => close(null)} className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-white">閉じる</button>
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const t = useGame(s => s.toast);
  if (!t) return null;
  return <div role="status" className="glass-solid fade-up pointer-events-none absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm">{t}</div>;
}
