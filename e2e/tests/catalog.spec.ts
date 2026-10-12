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

test('products: create and list', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const name = `E2E Peas ${Date.now()}`;
  await signIn(page);

  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Add product' }).click();

  await expect(page.getByText('Product added')).toBeVisible();
  const productCell = project === 'mobile' ? page.getByText(name).last() : page.getByText(name).first();
  await expect(productCell).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/products-${project}.png`, fullPage: true });
});

test('parties: create party and open khata', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const name = `E2E Buyer ${Date.now()}`;
  await signIn(page);

  await page.goto('/parties');
  await page.getByRole('button', { name: 'Add party' }).first().click();

  const form = page.getByRole('dialog');
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Phone').fill('9000000000');
  await form.getByRole('button', { name: 'Add party' }).click();

  await expect(page.getByText('Party added')).toBeVisible();
  const partyCell = project === 'mobile' ? page.getByText(name).last() : page.getByText(name).first();
  await expect(partyCell).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await partyCell.click();
  await expect(page.getByText('Customer ID')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/party-profile-${project}.png`, fullPage: true });
});
