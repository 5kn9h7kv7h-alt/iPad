// Look-dev capture: renders the 8 reference compositions and, if a reference board is given,
// builds a side-by-side sheet (reference crop | current render) for visual review.
//   npm run build && node tests/e2e/lookdev.mjs [--tier high|mid|low] [--ref path/to/reference.png]
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const tier = arg('--tier', 'high'), ref = arg('--ref', '');
const OUT = new URL('./out/lookdev/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 8797;
const server = spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '' }, stdio: 'ignore' });

async function main() {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?debug&quality=${tier}`);
  await page.waitForFunction(() => window.__afterlife?.registry.camera, null, { timeout: 60000 });
  await page.addStyleTag({ content: 'nav,.hud,.panel,.panel-solid{display:none!important}' });
  const cards = await page.evaluate(() => window.__afterlife.postcards);
  // let the town wake up so streets are populated
  await page.evaluate(() => { window.__afterlife.setTime(10); window.__afterlife.setSpeed(10); });
  await page.waitForTimeout(6000);
  const stats = {};
  for (const c of cards) {
    await page.evaluate(h => { window.__afterlife.setSpeed(5); window.__afterlife.setTime(h, 'clear'); }, c.hour);
    await page.waitForTimeout(3500);
    await page.evaluate(() => window.__afterlife.setSpeed(1));
    await page.evaluate(([p, l]) => window.__afterlife.setCamera(p, l), [c.pos, c.look]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}${c.id}.png` });
    stats[c.id] = await page.evaluate(() => window.__afterlife.registry.stats);
  }
  writeFileSync(`${OUT}stats.json`, JSON.stringify({ tier, stats, errors }, null, 2));
  await browser.close();
  if (ref) {
    const py = spawnSync('python3', [new URL('./lookdev_sheet.py', import.meta.url).pathname, ref, OUT], { encoding: 'utf8' });
    console.log(py.stdout || py.stderr);
  }
  console.log(`lookdev (${tier}): ${OUT}`, errors.length ? `errors: ${errors.join(' | ')}` : 'no page errors');
}
try { await main(); } finally { server.kill(); }
