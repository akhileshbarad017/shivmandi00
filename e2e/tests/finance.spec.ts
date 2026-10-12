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

test('payments: record a receipt', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Payments & receipts' })).toBeVisible();

  await page.getByRole('button', { name: 'Record entry' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Amount/ }).fill('100');
  await dialog.getByRole('button', { name: 'Save entry' }).click();

  await expect(page.getByText('Receipt recorded')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/payments-${project}.png`, fullPage: true });
});

test('expenses: add an expense', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/expenses');
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();

  await page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Amount/ }).fill('200');
  await dialog.getByRole('button', { name: 'Save expense' }).click();

  await expect(page.getByText('Expense recorded')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/expenses-${project}.png`, fullPage: true });
});

test('whatsapp: log a message', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/whatsapp');
  await expect(page.getByRole('heading', { name: 'WhatsApp bills' })).toBeVisible();

  await page.getByRole('button', { name: 'Send bill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Message/ }).fill('Namaste, your bill is ready.');
  await dialog.getByRole('button', { name: 'Send & log' }).click();

  await expect(page.getByText('Message logged')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/whatsapp-${project}.png`, fullPage: true });
});
