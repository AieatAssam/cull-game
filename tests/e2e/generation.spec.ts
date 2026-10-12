import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('loads seeded generated terrain and AdaptiveBot mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug&bot=adaptive&seed=17&frozen=1');
  await expect(page.locator('.brand strong')).toHaveText('CULL');
  const initial = await page.evaluate(() => window.__cull.state());
  expect(initial.seed).toBe(17);
  expect(initial.tiles.length).toBeGreaterThan(0);
  expect(initial.path.length).toBeGreaterThan(100);
  expect(initial.entities.length).toBeGreaterThan(6);
  await page.evaluate(() => window.__cull.step(240));
  expect((await page.evaluate(() => window.__cull.state())).tick).toBe(240);
  expect(errors).toEqual([]);
  await mkdir('artifacts/screens/m5', { recursive: true });
  const metrics = await page.evaluate(() => window.__cull.performance());
  expect(metrics.drawCalls).toBeLessThanOrEqual(24);
  expect(metrics.triangles).toBeLessThanOrEqual(60_000);
  await writeFile('artifacts/screens/m5/perf.json', `${JSON.stringify(metrics, null, 2)}\n`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m5/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m5/1280x800.png' });
});
