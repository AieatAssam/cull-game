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
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data: ShareData) => Boolean(data.files?.length) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { Object.assign(window, { __sharedFile: data.files?.[0] instanceof File ? { name: data.files[0].name, size: data.files[0].size, type: data.files[0].type } : null }); } });
  });
  await page.locator('#share').click();
  const sharedFile = await page.evaluate(() => (window as Window & { __sharedFile?: { name: string; size: number; type: string } | null }).__sharedFile);
  expect(sharedFile).toEqual(expect.objectContaining({ name: 'cull-42.png', type: 'image/png' }));
  expect(sharedFile?.size).toBeGreaterThan(0);
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

test('unlocked lens rules and lens identity carry through the replay URL', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('cull.filmography.v1', JSON.stringify([{
    date: '2026-10-12', seed: 9, location: 'LONG TAKE', meters: 300, cuts: 20, score: 500, cause: 'wrapped',
    grade: 'S', closeCalls: 10, monitorUses: 5, shootSceneIndex: 3, finishedShoot: true, daily: true,
  }])));
  await page.goto('/?debug&frozen=1&seed=42&lens=anamorphic');
  expect(await page.evaluate(() => window.__cull.state().lens)).toBe('anamorphic');
  await expect(page.locator('#gate-ratio')).toContainText('2.39:1');
  const gateRatio = await page.locator('#gate').evaluate((gate) => {
    const rect = gate.getBoundingClientRect(); return rect.width / rect.height;
  });
  expect(gateRatio).toBeCloseTo(2.39, 1);
  await page.evaluate(() => { window.__cull.step(3); });
  const expectedHash = await page.evaluate(() => window.__cull.hash());
  await page.evaluate(() => window.__cull.finishForShare());
  const replayHref = await page.locator('#replay-link').getAttribute('href');
  expect(replayHref).toBeTruthy();
  expect(decodeReplay(new URL(replayHref!).hash.slice(1)).lens).toBe('anamorphic');
  const replay = await context.newPage();
  const replayUrl = new URL(replayHref!);
  replayUrl.searchParams.set('frozen', '1');
  await replay.goto(replayUrl.toString());
  expect(await replay.evaluate(() => window.__cull.state().lens)).toBe('anamorphic');
  await replay.evaluate(() => window.__cull.step(3));
  expect(await replay.evaluate(() => window.__cull.hash())).toBe(expectedHash);
  await replay.close();
  await page.selectOption('#lens-select', 'long-lens');
  await page.locator('#restart').click();
  const longLens = await page.evaluate(() => window.__cull.state());
  expect(longLens.lens).toBe('long-lens');
  expect(longLens.camera.zoom).toBe(10);
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
