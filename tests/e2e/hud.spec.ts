import { expect, test } from '@playwright/test';

const SHOTS = ['Close-up', 'Medium shot', 'Wide shot', 'Stand-in', 'Gone'];

test('caption and toast never name different shot sizes', async ({ page }) => {
  test.setTimeout(90_000);
  for (const seed of [1, 19, 2026]) {
    await page.goto(`/?debug&frozen=1&seed=${seed}&shoot=1`);
    const clashes = await page.evaluate(({ shots, ticks }) => {
      const named = (text: string) => shots.filter((shot) => text.includes(shot));
      const bad: string[] = [];
      for (let tick = 0; tick < ticks; tick++) {
        window.__cull.step(1);
        const caption = document.querySelector('#lod')?.textContent ?? '';
        const toast = document.querySelector('#message')?.textContent ?? '';
        const left = named(caption);
        const right = named(toast);
        if (right.some((shot) => !left.includes(shot))) bad.push(`${tick}: ${caption} || ${toast}`);
        if (bad.length > 4) break;
      }
      return bad;
    }, { shots: SHOTS, ticks: 600 });
    expect(clashes, `seed ${seed}`).toEqual([]);
  }
});
