// Screenshot every UX state at desktop + two touch phones. Render-only: drives the
// game through the same ?debug / window.__cull hooks as tests/e2e.
// Usage: node scripts/ux-capture.mjs <outDir> [baseUrl] [--only=state,WxH,...] [--missing]
// (serve with: npx vite preview --port 4173). --missing skips files that already exist.
import { chromium, devices } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const outDir = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? '/workspace/cull-ux/before';
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const base = positional[1] ?? 'http://localhost:4173';
const only = (process.argv.find((arg) => arg.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const missingOnly = process.argv.includes('--missing');
mkdirSync(outDir, { recursive: true });

const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => existsSync(path));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

const views = [
  { width: 1280, height: 720, touch: false },
  { width: 412, height: 915, touch: true },
  { width: 390, height: 844, touch: true },
];
const play = '/?debug&frozen=1&seed=17&shoot=1';

/**
 * Each state gets a fresh page so localStorage (tutorial seen, mute) starts clean.
 * Covers the title screen, slate, tutorial, in-take HUD, cut stamp, lost-her, pause menu,
 * results (plus its expanded "more" section) and the settings screen.
 */
const states = [
  ['title', '/?seed=17', async () => {}],
  ['slate', '/?seed=17', async (page) => { await page.locator('#play').click(); await page.waitForTimeout(150); }],
  ['tutorial', '/?seed=17', async (page) => { await page.locator('#play').click(); await page.locator('#roll').click(); await page.waitForTimeout(150); }],
  ['in-take-hud', play, async (page) => { await page.evaluate(() => window.__cull.step(90)); }],
  ['cut-stamp', play, async (page) => {
    await page.evaluate(() => {
      const s = window.__cull.state();
      window.__cull.setCamera(s.talent.x, s.talent.z, 14);
      window.__cull.step(120);
      window.__cull.input({ panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false, cut: true });
      window.__cull.step(3);
    });
  }],
  ['lost-her', play, async (page) => { await page.evaluate(() => { window.__cull.step(30); window.__cull.lostDemo(1.2); }); }],
  ['pause', play, async (page) => { await page.evaluate(() => window.__cull.step(30)); await page.keyboard.press('p'); await page.evaluate(() => window.__cull.step(0)); }],
  ['results', play, async (page) => { await page.evaluate(() => { window.__cull.step(200); window.__cull.finishForShare(); }); await page.waitForTimeout(300); }],
  ['results-more', play, async (page) => { await page.evaluate(() => { window.__cull.step(200); window.__cull.finishForShare(); }); await page.waitForTimeout(300); await page.locator('#end-more > summary').click(); await page.waitForTimeout(150); }],
  ['settings', '/?seed=17', async (page) => { await page.locator('#title-settings').click(); await page.waitForTimeout(150); }],
];

for (const view of views) {
  const context = await browser.newContext(view.touch
    ? { ...devices['Pixel 7'], viewport: { width: view.width, height: view.height }, hasTouch: true, isMobile: true }
    : { viewport: { width: view.width, height: view.height } });
  for (const [name, url, act] of states) {
    const file = `${outDir}/${name}-${view.width}x${view.height}.png`;
    if (only.length && !only.some((key) => key === name || key === `${view.width}x${view.height}`)) continue;
    if (missingOnly && existsSync(file)) continue;
    const page = await context.newPage();
    await page.addInitScript(() => { try { localStorage.clear(); } catch { /* ignore */ } });
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(400);
    try { await act(page); } catch (error) { console.warn(`${name} ${view.width}x${view.height}: ${error.message}`); }
    await page.waitForTimeout(200);
    await page.screenshot({ path: file });
    console.log('saved', file);
    await page.close();
  }
  await context.close();
}
await browser.close();
