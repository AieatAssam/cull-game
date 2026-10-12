import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('renders the empty viewfinder without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.brand strong')).toHaveText('CULL');
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
  await mkdir('artifacts/screens/m0', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screens/m0/390x844.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'artifacts/screens/m0/1280x800.png' });
});
