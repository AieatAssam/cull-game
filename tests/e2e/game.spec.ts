import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function debugState(page: Page) {
  return page.evaluate(() => window.__cull.state());
}

test('loads the CULL gate and responds to camera input', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug&seed=17&frozen=1');
  await expect(page.locator('.brand strong')).toHaveText('CULL');
  const before = (await debugState(page)).camera.x;
  await page.keyboard.down('d');
  await page.evaluate(() => window.__cull.step(6));
  await page.keyboard.up('d');
  const after = (await debugState(page)).camera.x;
  expect(after).toBeGreaterThan(before);
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas has no bounds');
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 35, canvas.y + canvas.height / 2);
  await page.evaluate(() => window.__cull.step(5));
  await page.mouse.up();
  await page.mouse.move(canvas.x + 8, canvas.y + 8);
  await page.mouse.wheel(0, -120);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })));
  await page.evaluate(() => window.__cull.step(1));
  expect((await debugState(page)).camera.zoom).toBeLessThan(30);
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
  await mkdir('artifacts/screens/m2', { recursive: true });
  const metrics = await page.evaluate(() => window.__cull.performance());
  expect(metrics.drawCalls).toBeLessThanOrEqual(24);
  expect(metrics.triangles).toBeLessThanOrEqual(60_000);
  await writeFile('artifacts/screens/m2/perf.json', `${JSON.stringify(metrics, null, 2)}\n`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m2/390x844.png' });
  await page.evaluate(() => { window.__cull.setTier(0); window.__cull.step(1); });
  await page.screenshot({ path: 'artifacts/screens/m2/390x844-close.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m2/1280x800.png' });
  await page.evaluate(() => { window.__cull.setTier(3); window.__cull.step(1); });
  await page.screenshot({ path: 'artifacts/screens/m2/1280x800-wide.png' });
});

test('touch emulation pans and zoom control responds', async ({ page }) => {
  await page.goto('/?debug&seed=18&frozen=1');
  const before = (await debugState(page)).camera.x;
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas has no bounds');
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: x + 35, clientY: y, bubbles: true }));
  }, { x: box.x + 40, y: box.y + 40 });
  await page.evaluate(() => window.__cull.step(5));
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })));
  await page.locator('#zoom-slider').evaluate((node: HTMLInputElement) => { node.value = '18'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(async () => (await debugState(page)).camera.zoom).toBe(18);
  expect((await debugState(page)).camera.x).not.toBe(before);
});
