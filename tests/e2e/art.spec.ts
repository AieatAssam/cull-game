import { expect, test } from '@playwright/test';

test('hazard silhouettes stay distinct and tall enough at a medium zoom', async ({ page }) => {
  await page.goto('/?debug&frozen=1&seed=1');
  const report = await page.evaluate(() => window.__cull.silhouettes());
  expect(report.failures).toEqual([]);
});
