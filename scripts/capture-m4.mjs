import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? '/opt/cursor/artifacts/m4-before';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
const scenes = [[0, 'backlot'], [1, 'city'], [2, 'night']];
const views = [[1280, 720], [412, 915]];
for (const [index, name] of scenes) {
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${base}/?debug&frozen=1&seed=1&shoot=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas');
    await page.evaluate((sceneIndex) => {
      window.__cull.loadShootScene(sceneIndex);
      const state = window.__cull.state();
      window.__cull.setCamera(state.talent.x, state.talent.z, 30);
      window.__cull.step(8);
    }, index);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/${name}-${w}x${h}.png` });
    if (w === 1280) {
      await page.evaluate(() => {
        const state = window.__cull.state();
        window.__cull.setCamera(state.talent.x, state.talent.z, 12);
        window.__cull.step(1);
      });
      await page.locator('.gate').screenshot({ path: `${outDir}/${name}-crop.png` });
    }
    console.log('set', name, w, h);
  }
}

const kinds = ['urchin', 'boulder', 'glass', 'extras', 'swarm', 'rumour', 'stagehand', 'monitor', 'red-monitor', 'continuity'];
await page.setViewportSize({ width: 1280, height: 720 });
for (const kind of kinds) {
  const found = await page.evaluate(async (target) => {
    const order = target === 'urchin' || target === 'glass' || target === 'extras' ? [0, 1, 2]
      : target === 'swarm' || target === 'rumour' || target === 'red-monitor' || target === 'continuity' ? [2, 1, 0]
        : [1, 2, 0];
    for (const sceneIndex of order) {
      window.__cull.loadShootScene(sceneIndex);
      const state = window.__cull.state();
      const entity = state.entities.find((item) => item.kind === target);
      if (!entity) continue;
      window.__cull.setCamera(entity.x, entity.z, 12);
      window.__cull.step(30);
      const after = window.__cull.state();
      const live = after.entities.find((item) => item.id === entity.id);
      return { sceneIndex, x: live?.x ?? entity.x, z: live?.z ?? entity.z, spawned: Boolean(live?.spawned && !live?.cut) };
    }
    return null;
  }, kind);
  if (!found) { console.log('missing', kind); continue; }
  await page.evaluate(({ x, z }) => window.__cull.setCamera(x, z, 12), found);
  await page.evaluate(() => window.__cull.step(1));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${outDir}/hazard-${kind}.png` });
  console.log('hazard', kind, found);
}
await browser.close();
