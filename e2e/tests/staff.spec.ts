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

test('staff: add employee and mark attendance', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const name = `E2E Staff ${Date.now()}`;
  await signIn(page);

  await page.goto('/staff');
  await page.getByRole('button', { name: 'Add employee' }).click();

  const form = page.getByRole('dialog');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel(/Monthly salary/).fill('15000');
  await form.getByRole('button', { name: 'Add employee' }).click();
  await expect(page.getByText('Employee added')).toBeVisible();

  const attendanceButtons = page.getByRole('button', { name: 'Attendance' });
  await (project === 'mobile' ? attendanceButtons.last() : attendanceButtons.first()).click();
  const attendance = page.getByRole('dialog', { name: /attendance/ });
  await expect(attendance).toBeVisible();
  await attendance.getByRole('button', { name: /^1\b/ }).click();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: `screenshots/staff-${project}.png`, fullPage: false });
});

