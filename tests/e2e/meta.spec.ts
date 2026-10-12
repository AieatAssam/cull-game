import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeReplay } from '../../src/replay/codec';
import { dailySeed } from '../../src/meta/daily';

test('records a local result and exports a 1080x1350 contact sheet with a replay URL', async ({ page, context }) => {
  test.setTimeout(120_000);
  page.on('pageerror', (error) => console.error('browser page error:', error.message));
  await page.goto('/?debug&frozen=1&seed=42');
  await page.evaluate(() => {
    window.__cull.input({ panX: 12.5, panZ: -4.4, zoom: 0, rotate: 0, hold: false, steady: false });
    window.__cull.step(); window.__cull.step(); window.__cull.step();
  });
  const expectedHash = await page.evaluate(() => window.__cull.hash());
  await page.evaluate(() => window.__cull.finishForShare());
  await expect(page.locator('#end-card')).toBeVisible();
  await expect(page.locator('#grade-detail')).toContainText('GRADE');
  await expect(page.locator('#filmography-list li').first()).toContainText('BACKLOT');
  const reelButton = page.locator('#make-reel');
  if (await reelButton.isVisible()) {
    await reelButton.click();
    await expect(page.locator('#download-reel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#download-reel')).toHaveAttribute('download', /\.webm$/);
    const reelBytes = await page.locator('#download-reel').evaluate(async (node: HTMLAnchorElement) => (await fetch(node.href).then((response) => response.blob())).size);
    expect(reelBytes).toBeGreaterThan(0);
  }
  const contactHref = await page.locator('#download-sheet').getAttribute('href');
  expect(contactHref).toMatch(/^data:image\/png;base64,/);
  const contactSize = await page.evaluate(async () => {
    const image = new Image(); image.src = document.querySelector<HTMLAnchorElement>('#download-sheet')!.href; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  expect(contactSize).toEqual([1080, 1350]);
  const replayUrl = await page.locator('#replay-link').getAttribute('href');
  expect(replayUrl).toBeTruthy();
  expect(decodeReplay(new URL(replayUrl!).hash.slice(1))).toEqual(expect.objectContaining({ seed: 42, frames: expect.any(Array) }));
  const replayPage = await context.newPage();
  const frozenReplay = new URL(replayUrl!); frozenReplay.searchParams.set('frozen', '1');
  await replayPage.goto(frozenReplay.toString());
  await replayPage.evaluate(() => window.__cull.step(3));
  expect(await replayPage.evaluate(() => window.__cull.hash())).toBe(expectedHash);
  await replayPage.close();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('cull.filmography.v1') ?? '[]')) as Array<{ seed: number; cause: string; grade: string; thirdsPercent: number }>;
  expect(history[0]).toEqual(expect.objectContaining({ seed: 42, cause: 'hit', grade: expect.any(String), thirdsPercent: expect.any(Number) }));
  const base64 = await page.locator('#download-sheet').getAttribute('href').then((href) => href!.split(',')[1]!);
  await mkdir('artifacts/screens/m9', { recursive: true });
  await writeFile('artifacts/screens/m9/contact-sheet.png', Buffer.from(base64, 'base64'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m9/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m9/1280x800.png' });
});

test('daily seed is stable for the current UTC date', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.goto('/?daily=1&debug&frozen=1');
  const seed = await page.evaluate(() => window.__cull.state().seed);
  expect(seed).toBe(dailySeed(today));
});

test('polish controls expose their state, assist is labelled, and reduced motion removes flash transitions', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug&frozen=1&seed=13');
  await expect(page.locator('#pause')).toHaveAttribute('aria-label', 'Pause game');
  await page.locator('#sound-settings summary').click();
  await page.locator('#volume-master').evaluate((node: HTMLInputElement) => { node.value = '42'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#mono-audio').check();
  await page.locator('#calm-audio').check();
  const storedAudio = await page.evaluate(() => JSON.parse(localStorage.getItem('cull.audio.v1') ?? '{}')) as { master: number; mono: boolean; calm: boolean };
  expect(storedAudio).toEqual(expect.objectContaining({ master: 0.42, mono: true, calm: true }));
  await mkdir('artifacts/screens/m8', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m8/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m8/1280x800.png' });
  await page.locator('#sound-settings summary').click();
  await page.locator('#left-hand').click();
  await expect(page.locator('.stage')).toHaveClass(/left-handed/);
  await expect(page.locator('#left-hand')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#overcrank').click();
  await expect(page.locator('#overcrank')).toHaveAttribute('aria-pressed', 'true');
  const visibleRings = await page.evaluate(() => {
    window.__cull.loadLodDemo(); window.__cull.step();
    window.__cull.setTier(3); window.__cull.step();
    return window.__cull.lod().visibleRings;
  });
  expect(visibleRings).toBe(0);
  const duration = await page.locator('#cut-flash').evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(duration.split(',').every((value) => Number.parseFloat(value) <= 0.0001)).toBe(true);
  await mkdir('artifacts/screens/m10', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m10/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m10/1280x800.png' });
  await page.evaluate(() => window.__cull.finishForShare());
  await expect(page.locator('#share-card')).toContainText('75% SPEED ASSIST');
});
