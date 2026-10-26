// 見た目だけの演出（常時動く背景・HUDの時計）。アプリの動作には関与しない。
// 低消費電力のため: 30fps上限 / DPR上限1.5 / 画面が隠れたら停止 / 「動きを減らす」設定では静止画。
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

function startClock() {
  const clock = $('#hud-clock');
  const date = $('#hud-date');
  const up = $('#hud-up');
  if (!clock) return;
  const t0 = Date.now();
  const tick = () => {
    const d = new Date();
    clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    if (date) date.textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '').toUpperCase();
    if (up) { const s = Math.floor((Date.now() - t0) / 1000); up.textContent = `UP ${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
  };
  tick();
  setInterval(tick, 1000);
}

function startNet() {
  const canvas = $('#bg-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const css = getComputedStyle(document.documentElement);
  const c1 = css.getPropertyValue('--accent').trim() || '#2de2ff';
  const c2 = css.getPropertyValue('--accent-2').trim() || '#a78bfa';
  let w = 0, h = 0, nodes = [], raf = 0, last = 0;

  const rgba = (hex, a) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(48, Math.max(18, (w * h) / 30000)));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.32, vy: (Math.random() - 0.5) * 0.32,
      r: Math.random() * 1.5 + 0.7, alt: Math.random() < 0.28, ph: Math.random() * 6.28,
    }));
  };
  const LINK = 140;
  const frame = (t, move) => {
    ctx.clearRect(0, 0, w, h);
    for (const p of nodes) {
      if (move) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.hypot(dx, dy);
        if (d < LINK) {
          ctx.strokeStyle = rgba(nodes[i].alt || nodes[j].alt ? c2 : c1, (1 - d / LINK) * 0.28);
          ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
        }
      }
    }
    for (const p of nodes) {
      const pulse = 0.55 + 0.45 * Math.sin(t / 900 + p.ph);
      ctx.fillStyle = rgba(p.alt ? c2 : c1, 0.35 + 0.5 * pulse);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + pulse * 0.6, 0, 6.283); ctx.fill();
    }
  };
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return; // 約30fps
    last = t;
    frame(t, true);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (document.hidden) return;
    if (reduce.matches) { frame(0, false); return; }
    raf = requestAnimationFrame(loop);
  };
  resize();
  window.addEventListener('resize', () => { resize(); run(); });
  document.addEventListener('visibilitychange', run);
  reduce.addEventListener?.('change', run);
  run();
}

export function startFx() {
  try { startClock(); startNet(); } catch (e) { console.warn('fx disabled', e); }
}
