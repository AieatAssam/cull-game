import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('renders the M4 roster on mobile and desktop within the frame budgets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?debug&roster=1&seed=17&frozen=1');
  await page.evaluate(() => { window.__cull.setCamera(10, 0, 18); window.__cull.step(3); });
  const state = await page.evaluate(() => window.__cull.state());
  const spawned = new Set(state.entities.filter((entity) => entity.spawned && !entity.cut).map((entity) => entity.kind));
  for (const kind of ['extras', 'swarm', 'stagehand', 'bridge', 'reel']) expect(spawned.has(kind), `${kind} is spawned in the seeded M4 view`).toBe(true);
  expect(errors).toEqual([]);
  await mkdir('artifacts/screens/m4', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m4/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m4/1280x800.png' });
  const metrics = await page.evaluate(() => window.__cull.performance());
  expect(metrics.drawCalls).toBeLessThanOrEqual(24);
  expect(metrics.triangles).toBeLessThanOrEqual(60_000);
  await writeFile('artifacts/screens/m4/perf.json', `${JSON.stringify(metrics, null, 2)}\n`);
});
