import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.CHROME_PATH || (process.env.CI ? undefined : '/usr/bin/chromium');
const launchOptions = { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] };

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 15_000 },
  testDir: './tests/e2e',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4173', launchOptions },
  projects: [
    { name: 'desktop', testIgnore: /mobile-touch\.spec\.ts/, use: { ...devices['Desktop Chrome'], hasTouch: true, launchOptions } },
    { name: 'mobile', testMatch: /mobile-touch\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: false },
});
