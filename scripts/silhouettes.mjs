import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/?debug&frozen=1&seed=1', { waitUntil: 'networkidle' });
const report = await page.evaluate(() => window.__cull.silhouettes());
mkdirSync('reports/art', { recursive: true });
const png = Buffer.from(report.sheet.split(',')[1], 'base64');
writeFileSync('reports/art/silhouettes-day1.png', png);
console.log(JSON.stringify({ ok: report.ok, heights: report.heights, contrasts: report.contrasts, failures: report.failures }, null, 2));
await browser.close();
if (!report.ok) process.exit(1);
