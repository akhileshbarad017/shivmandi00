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

test('dashboard renders hero, money, chart and recent bills', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await expect(page.getByText("Today's Sales")).toBeVisible();
  await expect(page.getByText('Collections & payouts')).toBeVisible();
  await expect(page.getByRole('link', { name: /To receive/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /To pay/ })).toBeVisible();
  await expect(page.getByText('Sales — last 7 days')).toBeVisible();
  await expect(page.getByText('Recent bills')).toBeVisible();

  // To Receive is a shortcut to customer credit
  await page.getByRole('link', { name: /To receive/ }).click();
  await expect(page).toHaveURL(/\/sales$/);
  await page.goBack();

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/dashboard-${project}.png`, fullPage: true });
});
