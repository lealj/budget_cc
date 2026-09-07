import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  (page as typeof page & { runtimeErrors: string[] }).runtimeErrors = errors;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Command overview', exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect((page as typeof page & { runtimeErrors: string[] }).runtimeErrors).toEqual([]);
});
test('dashboard renders without runtime errors or horizontal overflow across workstation sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('.safe-value')).toContainText('$6,900');
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
    [1440, 900],
    [1280, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/budget-cc-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test('manual expense supports full classification and recurrence, updates safe amount, and can be excluded', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name / description').fill('Test insurance');
  await dialog.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('123.45');
  await dialog.getByRole('button', { name: 'DYNAMIC' }).click();
  await dialog.getByRole('checkbox', { name: /Recurring expense/ }).check();
  await dialog.getByLabel('Frequency').selectOption('custom');
  await dialog.getByLabel('Interval (days)').fill('90');
  await dialog.getByLabel('Merchant').fill('Local insurer');
  await dialog.getByLabel('Notes').fill('Browser verification');
  await dialog.getByRole('button', { name: 'Save expense' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.safe-value')).toContainText('6,776');
  await page.getByRole('button', { name: 'Exclude Test insurance from forecast' }).click();
  await expect(page.locator('.safe-value')).toContainText('6,900');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Cash-flow ledger' })
    .click();
  await page.getByRole('textbox', { name: 'Search financial entries' }).fill('Test insurance');
  await expect(page.getByRole('row').filter({ hasText: 'Test insurance' })).toContainText(
    'EXCLUDED',
  );
});
test('primary income changes paycheck window, ledger edits, completion and deletion work', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add income', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name / source').fill('New salary');
  await dialog.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('4200');
  await dialog.getByRole('checkbox', { name: /Recurring income/ }).check();
  await dialog.getByLabel('Frequency').selectOption('biweekly');
  await dialog.getByRole('checkbox', { name: /Primary paycheck/ }).check();
  await dialog.getByRole('button', { name: 'Save income' }).click();
  await expect(page.locator('.countdown')).toContainText('00');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Cash-flow ledger' })
    .click();
  await page.getByRole('textbox', { name: 'Search financial entries' }).fill('New salary');
  await page.getByRole('button', { name: 'Edit New salary', exact: true }).click();
  await page.getByLabel('Name / source').fill('Updated salary');
  await page.getByRole('button', { name: 'Save income' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Search financial entries' }).fill('Updated salary');
  await page.getByRole('button', { name: 'Mark Updated salary received' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Updated salary' })).toContainText(
    'RECEIVED',
  );
  await page.getByRole('button', { name: 'Delete Updated salary', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('No events match your filters.')).toBeVisible();
});
test('allocation guard clamps amounts, allows custom destination and confirms local reservation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Capital allocation', exact: false }).click();
  await page.getByRole('spinbutton', { name: 'Extra car payment amount' }).fill('100000');
  await expect(page.getByRole('spinbutton', { name: 'Extra car payment amount' })).toHaveValue(
    '4400',
  );
  await page.getByRole('button', { name: 'Add destination' }).click();
  await page.getByRole('textbox', { name: 'Custom destination name' }).fill('Travel fund');
  await page.getByRole('button', { name: 'Add destination', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Travel fund amount' })).toBeVisible();
  await page.getByRole('button', { name: 'Allocate funds', exact: true }).last().click();
  await page.getByRole('button', { name: 'Confirm allocation' }).click();
  await expect(page.getByRole('status')).toContainText('$6,900 reserved');
  await expect(page.getByRole('spinbutton', { name: 'Extra car payment amount' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Command overview' }).click();
  await expect(page.locator('.safe-value')).toContainText('$0');
});
test('projection period, sync, operating limits and keyboard drawer dismissal work', async ({
  page,
}) => {
  await page.getByRole('button', { name: '90D', exact: true }).click();
  await expect(page.getByRole('img', { name: /90-day projected cash balance/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sync accounts', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('synchronization complete');
  await page.getByRole('button', { name: 'Operating limits', exact: true }).click();
  await page.getByLabel('Minimum cash reserve ($)').fill('3000');
  await page.getByRole('button', { name: 'Save operating limits' }).click();
  await expect(page.locator('.safe-value')).toContainText('$6,400');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeFocused();
});
test('allocation drafts stay synchronized between dashboard, drawer and allocation page', async ({
  page,
}) => {
  await page.getByRole('spinbutton', { name: 'Extra car payment amount' }).fill('1500');
  await page.getByRole('button', { name: 'Allocate funds', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('spinbutton', { name: 'Extra car payment amount' })).toHaveValue(
    '1500',
  );
  await dialog.getByRole('button', { name: '%', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Extra car payment percentage' }).fill('20');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('spinbutton', { name: 'Extra car payment amount' })).toHaveValue(
    '1380',
  );
  await page.getByRole('navigation').getByRole('button', { name: 'Capital allocation' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Extra car payment amount' })).toHaveValue(
    '1380',
  );
});
test('paid expenses update account cash without releasing their protected cash twice; skipped occurrences release it', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Mark Auto loan payment paid' }).click();
  await expect(page.getByRole('status')).toContainText('marked paid');
  await expect(page.locator('.safe-value')).toContainText('$6,900');
  await expect(page.locator('.reserve-heading')).toContainText('$10,155');
  await page.getByRole('button', { name: 'Skip Subscriptions occurrence' }).click();
  await expect(page.locator('.safe-value')).toContainText('$6,940');
  await page.getByRole('navigation').getByRole('button', { name: 'Cash-flow ledger' }).click();
  for (const filter of [
    'Income',
    'Expense',
    'Static',
    'Dynamic',
    'Upcoming',
    'Completed',
    'Recurring',
    'Manual',
    'Synced',
  ]) {
    await page.getByRole('combobox', { name: 'Filter financial entries' }).selectOption(filter);
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);
  }
  await page.getByRole('combobox', { name: 'Filter financial entries' }).selectOption('Completed');
  await page.getByRole('button', { name: 'Edit Auto loan payment' }).click();
  await page
    .getByRole('dialog')
    .getByRole('spinbutton', { name: 'Amount', exact: true })
    .fill('350');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Command overview' }).click();
  await expect(page.locator('.reserve-heading')).toContainText('$10,130');
  await expect(page.locator('.safe-value')).toContainText('$6,915');
});
test('reduced-motion disables GPU atmosphere and native drawer traps keyboard focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ambient')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'test-results/budget-cc-expense-drawer.png' });
});
