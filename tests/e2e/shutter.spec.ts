import { expect, test, type Page } from '@playwright/test';

// B1 step 2: the CUT control on the keyboard, and the per-cut readout it produces.

/** Past every tutorial card, then a lone Urchin set up just outside a tight frame on her. */
async function frameDemo(page: Page) {
  await page.goto('/?debug&seed=1');
  while (await page.evaluate(() => window.__cull.tutorial().showing)) await page.locator('#tutorial-next').click();
  await page.evaluate(() => {
    window.__cull.loadLodDemo();
    const { talent } = window.__cull.state();
    window.__cull.setCamera(talent.x - 1, talent.z, 4);
  });
}

for (const key of ['Space', 'Enter'] as const) {
  test(`${key} fires the shutter and stamps the cut hazard`, async ({ page }) => {
    await frameDemo(page);
    await expect(page.locator('#shutter-label')).toHaveText('READY');
    await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => window.__cull.state().shutter.last?.hits.length ?? -1)).toBeGreaterThan(0);
    await expect(page.locator('#cut-layer .cut-stamp').first()).toHaveText(/^(CLOSE \+\d+ \+2s|CUT \+\d+|TOO FAR)$/);
    await expect(page.locator('#take-score')).toHaveText(/^TAKE ×\d+ {2}[\d,]+$/);
    await expect(page.locator('#shutter-label')).toHaveText('RECHARGING');
    // A press while recharging shakes the meter and changes nothing in the sim.
    const tick = await page.evaluate(() => window.__cull.state().shutter.last!.tick);
    await page.keyboard.press(key);
    await expect(page.locator('#shutter-meter')).toHaveClass(/not-ready/);
    expect(await page.evaluate(() => window.__cull.state().shutter.last!.tick)).toBe(tick);
    await expect(page.locator('#shutter-label')).toHaveText('READY', { timeout: 5_000 });
  });
}

test('a CUT with nothing outside the frame shows the MISSED banner', async ({ page }) => {
  await page.goto('/?debug&seed=1');
  while (await page.evaluate(() => window.__cull.tutorial().showing)) await page.locator('#tutorial-next').click();
  await page.evaluate(() => { window.__cull.loadLodDemo(); window.__cull.setCamera(-2, 1, 40); });
  await page.keyboard.press('Space');
  await expect(page.locator('#cut-banner')).toHaveText(/^MISSED −2s$/);
});
