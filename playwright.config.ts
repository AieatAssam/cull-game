import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 15_000 },
  testDir: './tests/e2e',
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    hasTouch: true,
    launchOptions: { executablePath: process.env.CI ? undefined : '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] },
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: false },
});
