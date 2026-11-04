import { useRef } from 'react';
import { newGame, sim, useGame, useWorld } from '../store/game';
import { clearGame, parseSave, saveGame } from '../store/persist';
import { Chip, PanelShell, Section } from './common';

export function SettingsPanel() {
  const w = useWorld();
  const aiStatus = useGame(s => s.aiStatus);
  const aiEnabled = useGame(s => s.aiEnabled);
  const aiLog = useGame(s => s.aiLog);
  const setAi = useGame(s => s.setAi);
  const say = useGame(s => s.say);
  const speed = useGame(s => s.speed);
  const replaceWorld = useGame(s => s.replaceWorld);
  const quality = useGame(s => s.quality);
  const setQuality = useGame(s => s.setQuality);
  const file = useRef<HTMLInputElement>(null);

  const save = async () => say((await saveGame({ world: sim.world, savedAtMs: Date.now(), speed, aiEnabled })) ? '保存しました' : '保存できませんでした（ブラウザの設定を確認してください）');
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ world: sim.world, savedAtMs: Date.now(), speed, aiEnabled })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `afterlife-city-day${Math.floor(w.time / 1440)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    const rec = parseSave(await f.text());
    if (!rec) { say('読み込めないファイルです'); return; }
    replaceWorld(rec.world, 0); say('読み込みました');
  };
  const reset = async () => {
    if (!confirm('いまの街を破棄して、新しい街をはじめますか？（この操作は取り消せません）')) return;
    await clearGame(); newGame(); say('新しい街がはじまりました');
  };

  return (
    <PanelShell title="SETTINGS" sub="AFTERLIFE CITY v0.1">
      <Section title="AI">
        <div className="rounded-xl bg-white/5 p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div>AIによる出来事・会話の演出</div>
              <div className="text-[11px] text-slate-400">{aiStatus.enabled ? `接続中：${aiStatus.provider}（${aiStatus.model}）` : 'サーバー未設定（APIキーなしでも街は通常どおり動きます）'}</div>
            </div>
            <Chip active={aiEnabled && aiStatus.enabled} onClick={() => setAi({ aiEnabled: !aiEnabled })}>{aiEnabled ? 'ON' : 'OFF'}</Chip>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">AIが提案した出来事は、住人・場所・時間・既存設定との整合性を検証してから反映されます。数値や関係性をAIが直接変えることはありません。</p>
        </div>
        {aiLog.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px]">
            {aiLog.slice(0, 8).map((l, i) => <li key={i} className={l.ok ? 'text-emerald-300' : 'text-slate-500'}>{l.text}</li>)}
          </ul>
        )}
      </Section>
      <Section title="画質">
        <div className="flex gap-2">
          {([['low', '軽量'], ['mid', '標準（スマホ）'], ['high', '高画質（PC）']] as const).map(([k, l]) => <Chip key={k} active={quality === k} onClick={() => setQuality(k)}>{l}</Chip>)}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">スマホは標準が既定です。発熱や動作の重さを感じたら軽量にしてください。</p>
      </Section>
      <Section title="セーブ・ロード">
        <p className="mb-2 text-xs text-slate-400">街は約20秒ごと、および画面を離れるときに自動保存されます。次に開いたとき、経過時間ぶんの暮らしが進みます。</p>
        <div className="flex flex-wrap gap-2">
          <Chip active onClick={save}>いま保存</Chip>
          <Chip onClick={exportJson}>JSONを書き出す</Chip>
          <Chip onClick={() => file.current?.click()}>JSONを読み込む</Chip>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ''; }} />
        </div>
      </Section>
      <Section title="操作">
        <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
          <li>ドラッグ：カメラ移動／ピンチ・スクロール：ズーム（操作中は自動カメラが止まり、25秒後に戻ります）</li>
          <li>建物・住人をタップ：詳細。「この人を追う」でキャラクター追跡</li>
          <li>時間：⏸ / 1× / 2× / 5× / 10×（現実1秒＝街の1分）</li>
        </ul>
      </Section>
      <Section title="データ">
        <button onClick={reset} className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/30">新しい街をはじめる</button>
      </Section>
    </PanelShell>
  );
}
