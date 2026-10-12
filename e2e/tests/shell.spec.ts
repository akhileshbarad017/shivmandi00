import { test, expect } from '@playwright/test';

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

test('login page renders and authenticates into the shell', async ({ page }, testInfo) => {
  const project = testInfo.project.name;

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Vijay Pandey/ })).toBeVisible();
  await page.screenshot({ path: `screenshots/login-${project}.png`, fullPage: true });
  await assertNoHorizontalOverflow(page);

  await page.getByLabel(/Username or mobile/).fill('admin');
  await page.getByLabel(/Password/).fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Today at the mandi' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/dashboard-${project}.png`, fullPage: true });
  await assertNoHorizontalOverflow(page);
});

test('mobile: bottom nav and more sheet work', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');

  await page.goto('/login');
  await page.getByLabel(/Username or mobile/).fill('admin');
  await page.getByLabel(/Password/).fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Today at the mandi' })).toBeVisible();

  // Multi Sale is a first-class bottom-nav item
  await page.locator('nav').getByRole('link', { name: 'Multi' }).click();
  await expect(page.getByRole('heading', { name: 'Bulk billing' })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'All modules' });
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: 'screenshots/more-sheet-mobile.png', fullPage: false });

  await sheet.getByRole('link', { name: 'Parties' }).click();
  await expect(page.getByRole('heading', { name: 'Parties' })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.screenshot({ path: 'screenshots/parties-mobile.png', fullPage: true });
});
