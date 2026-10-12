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

test('new sale: create bill and open invoice with UPI QR', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);

  await page.goto('/sales/new');
  await expect(page.getByRole('heading', { name: 'New sale' })).toBeVisible();

  await page.getByRole('button', { name: 'Walk-in' }).click();
  await page.getByRole('textbox', { name: /Buyer name/ }).fill(`E2E Customer ${Date.now()}`);
  await page.getByRole('combobox', { name: /Product/ }).selectOption({ index: 1 });
  await page.getByRole('textbox', { name: /Qty/ }).fill('10');
  await page.getByRole('textbox', { name: /Rate/ }).fill('35');

  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/sale-new-${project}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Save & bill' }).click();
  await expect(page.getByText('Sale saved')).toBeVisible();

  const invoice = page.getByRole('dialog', { name: /Bill/ });
  await expect(invoice).toBeVisible();
  await page.screenshot({ path: `screenshots/invoice-${project}.png`, fullPage: false });

  const heading = (await invoice.getByRole('heading').first().textContent()) ?? '';
  const invoiceNo = heading.replace('Bill', '').trim();
  await page.keyboard.press('Escape');

  // Dedicated print page renders the bill standalone.
  await page.goto(`/print/${encodeURIComponent(invoiceNo)}`);
  await expect(page.getByText('VIJAY PANDEY & COMPANY').first()).toBeVisible();

  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: 'Sales history' })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/sales-${project}.png`, fullPage: true });
});

test('invoices page lists bills', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page);
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  const invoiceCell = project === 'mobile' ? page.getByText(/^S-\d+/).last() : page.getByText(/^S-\d+/).first();
  await expect(invoiceCell).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/invoices-${project}.png`, fullPage: true });
});
