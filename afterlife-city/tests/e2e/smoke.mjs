// E2E regression + performance budget check. Run: npm run build && npm run test:e2e
// Needs Playwright with Chromium (preinstalled in the cloud env). Software GL: judge draw calls/triangles, not fps.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const PORT = 8799;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });
const BASE = `http://127.0.0.1:${PORT}/?debug`;
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

const GPU = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// target = what we are aiming for on iPhone (V7); ceiling = measured V0 baseline + margin: fail if exceeded (no regressions).
const BUDGET = {
  mid: { target: [150, 300_000], ceiling: [150, 300_000] },
  high: { target: [300, 800_000], ceiling: [300, 800_000] },
};
const within = (s, [dc, tr]) => s.drawCalls <= dc && s.triangles <= tr;

async function open(browser, ctxOpts, query = '') {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(BASE + query);
  await page.waitForSelector('[data-testid=clock]', { timeout: 30000 });
  await page.waitForFunction(() => window.__afterlife?.registry.camera, null, { timeout: 30000 });
  return page;
}

const PART = process.env.E2E_PART ?? 'all'; // 'a' = world/features, 'b' = seasons/tiers/desktop (each fits a 2-minute window on slow hosts)
const runs = k => PART === 'all' || PART === k;

async function main() {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: GPU });
  const iphone = { ...devices['iPhone 14'], deviceScaleFactor: 1 }; // resolution does not change draw-call or triangle counts; keeps software GL fast enough

  // ---- 1. iPhone: content counts, budget at 4 times of day, screenshots
  const m = await open(browser, iphone);
  if (runs('a')) {
  const counts = await m.evaluate(() => window.__afterlife.counts());
  check(counts.citizens === 30 && counts.buildings === 26 && counts.areas === 5, `world intact: ${JSON.stringify(counts)}`);
  const tier = await m.evaluate(() => window.__afterlife.sim && localStorage.getItem('afterlife.quality') || 'auto');
  void tier;
  await m.click('button:has-text("⏸")');
  for (const [name, hour, wx] of [['dawn', 6.5, 'clear'], ['noon', 12, 'clear'], ['golden', 17.6, 'clear'], ['night', 21.5, 'clear'], ['rain', 15, 'rain'], ['fog', 8, 'fog']]) {
    await m.click('button:has-text("1×")');
    await m.evaluate(([h, w]) => window.__afterlife.setTime(h, w), [hour, wx]);
    await m.waitForTimeout(2500);
    await m.evaluate(() => window.__afterlife.setCamera([-30, 38, 70], [-10, 0, 20]));
    await m.click('button:has-text("⏸")');
    await m.waitForTimeout(1500);
    const s = await m.evaluate(() => window.__afterlife.registry.stats);
    check(within(s, BUDGET.mid.ceiling), `iPhone/mid ${name}: ${s.drawCalls} draw calls (ceiling ${BUDGET.mid.ceiling[0]}), ${Math.round(s.triangles)} tris`);
    if (!within(s, BUDGET.mid.target)) console.log(`WARN  iPhone/mid ${name} above target of ${BUDGET.mid.target[0]} draw calls`);
    await m.screenshot({ path: `${OUT}iphone_${name}.png` });
  }

  // ---- 2. rendering must not change simulation state
  await m.click('button:has-text("⏸")');
  const h1 = await m.evaluate(() => window.__afterlife.hash());
  await m.waitForTimeout(3000);
  const h2 = await m.evaluate(() => window.__afterlife.hash());
  check(h1 === h2, 'paused: 3s of rendering leaves world state byte-identical');

  // ---- 3. features: panels, follow, intervention, save/restore
  await m.click('button:has-text("1×")');
  await m.click('text=今、気になる人を見つける');
  await m.click('button:has-text("追跡")');
  await m.waitForTimeout(1500);
  check((await m.textContent('[data-testid=shot-label]')).includes('Follow'), 'character follow engages');
  for (const t of ['PEOPLE', 'EVENTS', 'HISTORY', 'SETTINGS', 'CITY']) { await m.click(`nav >> text=${t}`); await m.waitForTimeout(300); }
  await m.click('text=＋ 介入'); await m.click('button:has-text("ベンチ")'); await m.waitForTimeout(400);
  check((await m.evaluate(() => window.__afterlife.sim.world.props.length)) === 1, 'intervention places a bench');
  await m.click('button:has-text("⏸")');
  await m.click('nav >> text=SETTINGS'); await m.click('button:has-text("いま保存")'); await m.waitForTimeout(600);
  const t1 = await m.evaluate(() => window.__afterlife.sim.world.time);
  await m.reload(); await m.waitForSelector('[data-testid=clock]'); await m.waitForFunction(() => window.__afterlife?.registry.camera);
  const r = await m.evaluate(() => ({ t: window.__afterlife.sim.world.time, p: window.__afterlife.sim.world.props.length, c: window.__afterlife.counts() }));
  check(r.t >= t1 && r.p === 1 && r.c.citizens === 30, `save/restore keeps time, props, 30 residents (${t1}→${r.t})`);
  check(m.errors.length === 0, `no console/page errors${m.errors.length ? ': ' + m.errors.slice(0, 3).join(' | ') : ''}`);

  }
  // ---- 3b. seasons and weather render without errors (screenshots for review)
  if (runs('b')) {
  for (const [name, day, hour, wx] of [['summer', 100, 11, 'clear'], ['autumn', 190, 16.5, 'clear'], ['winter_snow', 250, 12, 'rain'], ['spring_blossom', 5, 9, 'clear']]) {
    await m.click('button:has-text("1×")');
    await m.evaluate(([d, h, w]) => { window.__afterlife.setDay(d); window.__afterlife.setTime(h, w); }, [day, hour, wx]);
    await m.waitForTimeout(3500);
    await m.evaluate(() => window.__afterlife.setCamera([30, 26, -2], [40, 1, -34]));
    await m.click('button:has-text("⏸")'); await m.waitForTimeout(1500);
    await m.screenshot({ path: `${OUT}iphone_${name}.png` });
    const s = await m.evaluate(() => window.__afterlife.registry.stats);
    check(within(s, BUDGET.mid.ceiling), `iPhone/mid ${name}: ${s.drawCalls} draw calls, ${Math.round(s.triangles)} tris`);
  }
  check(m.errors.length === 0, `seasons/weather: no console/page errors${m.errors.length ? ': ' + m.errors.slice(0, 2).join(' | ') : ''}`);

  // ---- 3c. low tier budget
  const lo = await open(browser, iphone, '&quality=low');
  await lo.evaluate(() => window.__afterlife.setTime(17.6)); await lo.waitForTimeout(3000);
  await lo.evaluate(() => window.__afterlife.setCamera([-30, 38, 70], [-10, 0, 20])); await lo.waitForTimeout(1500);
  const sl = await lo.evaluate(() => window.__afterlife.registry.stats);
  check(sl.drawCalls <= 100 && sl.triangles <= 150_000, `iPhone/low golden: ${sl.drawCalls} draw calls (≤100), ${Math.round(sl.triangles)} tris (≤150000)`);
  await lo.close();

  // ---- 4. desktop high tier budget
  const d = await open(browser, { viewport: { width: 1280, height: 800 } });
  await d.evaluate(() => window.__afterlife.setTime(17.6));
  await d.waitForTimeout(3000);
  await d.evaluate(() => window.__afterlife.setCamera([-30, 38, 70], [-10, 0, 20]));
  await d.waitForTimeout(1500);
  const sd = await d.evaluate(() => window.__afterlife.registry.stats);
  check(within(sd, BUDGET.high.ceiling), `desktop/high golden: ${sd.drawCalls} draw calls, ${Math.round(sd.triangles)} tris`);
  await d.screenshot({ path: `${OUT}desktop_golden.png` });
  }
  await browser.close();
}

try { await main(); } catch (e) { console.error(e); fails.push(String(e)); } finally { server.kill(); }
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log('\nAll e2e checks passed. Screenshots: tests/e2e/out/');
