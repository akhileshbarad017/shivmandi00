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

test('purchase: create a bill and record a payment', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  // The production ledger ships no suppliers, so create one for this bill.
  const supplierName = `E2E Supplier ${Date.now()}`;
  await page.goto('/parties');
  await page.getByRole('button', { name: 'Add party' }).first().click();
  const partyForm = page.getByRole('dialog');
  await partyForm.getByLabel('Name').fill(supplierName);
  await partyForm.getByLabel('Type').selectOption('supplier');
  await partyForm.getByRole('button', { name: 'Add party' }).click();
  await expect(page.getByText('Party added')).toBeVisible();

  await page.goto('/purchases/new');
  await expect(page.getByRole('heading', { name: 'New purchase' })).toBeVisible();

  await page.getByRole('button', { name: 'Supplier', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${supplierName}`) }).click();
  await page.getByRole('combobox', { name: /Product/ }).selectOption({ index: 1 });
  await page.getByRole('textbox', { name: /Weight/ }).fill('100');
  await page.getByRole('textbox', { name: /Rate/ }).fill('20');
  await page.getByRole('textbox', { name: /Commission/ }).fill('10');
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/purchase-new-${project}.png`, fullPage: true });

  await page.getByRole('button', { name: /^Save/ }).dispatchEvent('click');
  await expect(page.getByText('Purchase saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Purchase history' })).toBeVisible();

  const billCell = project === 'mobile' ? page.getByText(/^P-\d+$/).last() : page.getByText(/^P-\d+$/).first();
  await expect(billCell).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/purchases-${project}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Pay' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Amount/ }).fill('100');
  await dialog.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Payment recorded')).toBeVisible();
});

