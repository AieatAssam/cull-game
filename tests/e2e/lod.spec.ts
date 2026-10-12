import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('renders the Urchin mesh bucket at all four tiers and culls its sub-pixel proxy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?debug&frozen=1');
  expect(errors).toEqual([]);
  await page.evaluate(() => { window.__cull.loadLodDemo(); window.__cull.step(); });
  await mkdir('artifacts/screens/m3', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m3/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m3/1280x800.png' });

  const tierNames = ['close', 'medium', 'wide', 'proxy', 'sub-pixel'];
  for (let tier = 0; tier < tierNames.length; tier++) {
    await page.evaluate((value) => { window.__cull.setTier(value); window.__cull.step(); }, tier);
    const diagnostics = await page.evaluate(() => window.__cull.lod());
    expect(diagnostics.bucketCounts).toEqual(tier < 4 ? [tier === 0 ? 1 : 0, tier === 1 ? 1 : 0, tier === 2 ? 1 : 0, tier === 3 ? 1 : 0, 0] : [0, 0, 0, 0, 0]);
    expect(diagnostics.visibleRings).toBeGreaterThan(0);
    await page.screenshot({ path: `artifacts/screens/m3/urchin-${tierNames[tier]}.png` });
  }
  const metrics = await page.evaluate(() => window.__cull.performance());
  expect(metrics.drawCalls).toBeLessThanOrEqual(24);
  expect(metrics.triangles).toBeLessThanOrEqual(60_000);
  await writeFile('artifacts/screens/m3/perf.json', `${JSON.stringify(metrics, null, 2)}\n`);
});
