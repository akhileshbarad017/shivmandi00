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

test('reports: switch between report types', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

  await page.getByRole('button', { name: 'Profit & Loss' }).click();
  await expect(page.getByText('Net profit').first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/reports-pl-${project}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Balance Sheet' }).click();
  await expect(page.getByText('Total assets')).toBeVisible();

  await page.getByRole('button', { name: 'Commodity' }).click();
  await expect(page.getByText('Stock value')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/reports-commodity-${project}.png`, fullPage: true });
});

test('settings: save shop profile and account', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.getByLabel('Tagline').fill('Wholesale & Retail Vegetable Merchant');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByText('Account updated')).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/settings-account-${project}.png`, fullPage: true });
});

