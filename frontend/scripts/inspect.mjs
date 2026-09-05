import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
const external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (request) => {
  if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('data:'))
    external.push(request.url());
});
try {
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('heading', { name: 'Command overview', exact: true }).waitFor();
  await page.waitForTimeout(700);
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/production-desktop.png', fullPage: true });
  const positions = await page
    .locator('.safe-panel,.projection-panel,.spending-panel,.reserve-panel,.allocation-panel')
    .evaluateAll((elements) =>
      elements.map((el) => ({
        panel: el.className,
        y: Math.round(el.getBoundingClientRect().y),
        height: Math.round(el.getBoundingClientRect().height),
      })),
    );
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/production-drawer.png' });
  console.log(
    JSON.stringify(
      { errors, external, positions, canvas: await page.locator('canvas').count() },
      null,
      2,
    ),
  );
  if (errors.length || external.length) process.exitCode = 1;
} finally {
  await browser.close();
}
