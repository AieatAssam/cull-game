import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('renders every Shoot biome and the Long Take without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?shoot=1&debug&seed=17&frozen=1');
  await expect(page.locator('.slate strong')).toHaveText('BACKLOT');
  await page.evaluate(() => window.__cull.loadShootScene(1));
  expect((await page.evaluate(() => window.__cull.state())).shoot?.biome).toBe('MINIATURE CITY');
  await page.evaluate(() => window.__cull.loadShootScene(2));
  expect((await page.evaluate(() => window.__cull.state())).shoot?.biome).toBe('NIGHT SHOOT');
  await page.evaluate(() => window.__cull.loadShootScene(3));
  await expect(page.locator('.slate strong')).toHaveText('LONG TAKE');
  expect(await page.evaluate(() => window.__cull.performance())).toEqual(expect.objectContaining({ drawCalls: expect.any(Number), triangles: expect.any(Number) }));
  expect(await page.evaluate(() => window.__cull.performance().drawCalls)).toBeLessThanOrEqual(24);
  expect(errors).toEqual([]);
  await mkdir('artifacts/screens/m6', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m6/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m6/1280x800.png' });
  const metrics = await page.evaluate(() => window.__cull.performance());
  await writeFile('artifacts/screens/m6/perf.json', `${JSON.stringify(metrics, null, 2)}\n`);
});
