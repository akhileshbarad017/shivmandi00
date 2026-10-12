import { test, expect, type Page } from '@playwright/test';

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/Username or mobile/).fill('admin');
  await page.getByLabel(/Password/).fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Today at the mandi' })).toBeVisible();
}

test('bulk billing: generate bills for a customer', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/sales/multi');
  await expect(page.getByRole('heading', { name: 'Bulk billing' })).toBeVisible();

  // Search with auto-suggestions, then pick a real customer from the ledger.
  const search = page.getByPlaceholder(/Search name, customer ID or mobile/);
  await search.click();
  await search.fill('Girish');
  await page.getByRole('button', { name: /Girish Vansda/ }).first().dispatchEvent('click');

  // Select a vegetable -> matrix appears
  await page.getByRole('button', { name: /Banana/ }).dispatchEvent('click');

  // First row: qty + rate (rate has no default now)
  await page.locator('input[inputmode="decimal"]').first().fill('5');
  await page.locator('input[inputmode="decimal"]').nth(1).fill('45');

  await page.screenshot({ path: `screenshots/bulk-${project}.png`, fullPage: true });

  await page.getByRole('button', { name: /Generate/ }).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: 'Bills generated' })).toBeVisible();
  await page.screenshot({ path: `screenshots/bulk-results-${project}.png`, fullPage: true });
});

