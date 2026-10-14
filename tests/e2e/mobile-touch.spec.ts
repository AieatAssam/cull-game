import { expect, test, type Page } from '@playwright/test';

// Mobile project only (hasTouch + isMobile): the tutorial blocks the take, and touch drives the camera, never the page.
const camera = (page: Page) => page.evaluate(() => { const s = window.__cull.state(); return { x: s.camera.x, zoom: s.camera.zoom, tick: s.tick, failed: s.failed ?? null }; });
const pageView = (page: Page) => page.evaluate(() => ({ scrollX, scrollY, scale: visualViewport?.scale ?? 1, overflow: document.documentElement.scrollHeight - innerHeight }));

for (const viewport of [{ width: 412, height: 915 }, { width: 390, height: 844 }]) {
  test.describe(`touch play at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('tutorial pauses the take, then drag pans and pinch zooms the camera', async ({ page }) => {
      await page.goto('/?debug&seed=1');
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<[number, number]>) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
      const start = await pageView(page);
      expect(start.overflow).toBeLessThanOrEqual(0);

      // The title screen blocks too: nothing rolls until Play.
      expect(await page.evaluate(() => window.__cull.tutorial())).toMatchObject({ showing: true, title: true, paused: true });
      await page.waitForTimeout(400);
      expect(await camera(page)).toMatchObject({ tick: 0, failed: null });
      await page.locator('#play').tap();
      // Every coach step on the slate blocks: no ticks advance and nothing can hurt her while it is up, however long it is read.
      for (let step = 0; ; step++) {
        const tutorial = await page.evaluate(() => window.__cull.tutorial());
        if (!tutorial.showing) break;
        expect(tutorial).toMatchObject({ step, paused: true });
        const [card, frame] = [(await page.locator('#slate-card').boundingBox())!, (await page.locator('#gate').boundingBox())!];
        expect(card.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
        await page.waitForTimeout(400);
        expect(await camera(page)).toMatchObject({ tick: 0, failed: null });
        await page.locator('#roll').tap();
      }
      await expect.poll(async () => (await camera(page)).tick).toBeGreaterThan(0);
      // The gestures run on the wall clock, so swap the live take for the static LOD stage: its lone Urchin has no speed and
      // cannot home on her off-frame, so a slow runner can't lose her mid-gesture. The camera and touch path are unchanged.
      await page.evaluate(() => window.__cull.loadLodDemo());
      const gate = (await page.locator('#gate').boundingBox())!;

      const cx = gate.x + gate.width / 2; const cy = gate.y + gate.height / 2;
      const before = await camera(page);
      await touch('touchStart', [[cx + 80, cy]]);
      for (let i = 1; i <= 12; i++) { await touch('touchMove', [[cx + 80 - i * 14, cy]]); await page.waitForTimeout(16); }
      await page.waitForTimeout(200);
      await touch('touchEnd', []);
      expect((await camera(page)).x).not.toBeCloseTo(before.x, 1);

      await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
      for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 40 - i * 10, cy], [cx + 40 + i * 10, cy]]); await page.waitForTimeout(16); }
      await touch('touchEnd', []);
      await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(before.zoom - 4);

      expect(await pageView(page)).toMatchObject({ scrollX: 0, scrollY: start.scrollY, scale: 1 });
      expect((await camera(page)).failed).toBeNull();
    });

    test('touch controls are at least 44 px, sit in the bottom thumb zone, and swap key chips for touch hints', async ({ page }) => {
      await page.goto('/?debug&seed=1');
      await page.locator('#play').tap();
      while ((await page.evaluate(() => window.__cull.tutorial().showing))) await page.locator('#roll').tap();
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.stage button, .stage summary, .stage select')]
        .map((el) => ({ label: el.textContent?.trim() || el.getAttribute('aria-label'), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width && (box.width < 44 || box.height < 44)).map(({ label }) => label));
      expect(small).toEqual([]);
      const gate = (await page.locator('#gate').boundingBox())!;
      let top = Number.POSITIVE_INFINITY;
      let bottom = 0;
      for (const id of ['#hold', '#cut', '#rotate-left', '#rotate-right', '#zoom-out', '#zoom-in']) {
        const box = (await page.locator(id).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(gate.y + gate.height);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        top = Math.min(top, box.y);
        bottom = Math.max(bottom, box.y + box.height);
      }
      // The cluster is anchored to the bottom thumb zone; portrait phones get the 2:3 gate, full width above it.
      expect(viewport.height - bottom).toBeLessThan(32);
      expect(Math.abs(gate.height - gate.width * 1.5)).toBeLessThan(2);
      expect(gate.width).toBeGreaterThan(viewport.width - 24);
      // Hold is the left thumb, CUT the right; the pause button sits above the frame, outside it.
      expect((await page.locator('#hold').boundingBox())!.x).toBeLessThan(viewport.width / 2);
      const pause = (await page.locator('#pause').boundingBox())!;
      expect(pause.y + pause.height).toBeLessThanOrEqual(gate.y);
      // The portrait gate hugs the pause row above and the message strip below; spare height goes above the controls.
      const notes = (await page.locator('.gate-notes').boundingBox())!;
      expect(gate.y - (pause.y + pause.height)).toBeLessThan(16);
      expect(notes.y - (gate.y + gate.height)).toBeLessThan(16);
      expect(pause.x + pause.width / 2).toBeGreaterThan(viewport.width / 2);
      const film = (await page.locator('.film').boundingBox())!;
      expect(film.y + film.height).toBeLessThanOrEqual(viewport.height);
      await expect(page.locator('.controls')).toBeHidden();
      await expect(page.locator('.margin .touch-hint')).toBeVisible();

      const zoom = (await camera(page)).zoom;
      await page.locator('#zoom-in').tap();
      await expect.poll(async () => (await camera(page)).zoom).toBeLessThan(zoom - 3);
    });
  });
}

test.describe('touch CUT button', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('is a ≥72 px thumb button bottom-right, off the viewfinder, and a tap stamps the cut', async ({ page }) => {
    await page.goto('/?debug&seed=1');
    await page.locator('#play').tap();
    while (await page.evaluate(() => window.__cull.tutorial().showing)) await page.locator('#roll').tap();
    const [cut, gate] = [(await page.locator('#cut').boundingBox())!, (await page.locator('#gate').boundingBox())!];
    expect(Math.min(cut.width, cut.height)).toBeGreaterThanOrEqual(72);
    expect(cut.y).toBeGreaterThanOrEqual(gate.y + gate.height);
    expect(cut.x + cut.width / 2).toBeGreaterThan(390 / 2);
    expect(cut.y + cut.height).toBeLessThanOrEqual(844);
    await page.evaluate(() => {
      window.__cull.loadLodDemo();
      const { talent } = window.__cull.state();
      window.__cull.setCamera(talent.x - 1, talent.z, 4);
    });
    await page.locator('#cut').tap();
    await expect.poll(() => page.evaluate(() => window.__cull.state().shutter.last?.hits.length ?? -1)).toBeGreaterThan(0);
    await expect(page.locator('#cut-layer .cut-stamp').first()).toBeAttached();
    await expect(page.locator('#cut')).not.toHaveClass(/\bready\b/);
  });
});
