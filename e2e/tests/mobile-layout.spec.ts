import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/Username or mobile/).fill('admin');
  await page.getByLabel(/Password/).fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Today at the mandi' })).toBeVisible();
}

const ROUTES = ['/', '/sales/multi', '/parties', '/sales/new', '/purchases/new', '/staff'];

test('mobile: login page has no horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  for (const width of [320, 360, 414]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Vijay Pandey/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `login @${width}px should not scroll horizontally`).toBeLessThanOrEqual(1);
  }
});

test('mobile: no horizontal overflow at 320/360/414', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  await signIn(page);

  for (const width of [320, 360, 414]) {
    await page.setViewportSize({ width, height: 780 });
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${route} @${width}px should not scroll horizontally`).toBeLessThanOrEqual(1);
    }
    await page.goto('/sales/multi');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `screenshots/multi-${width}.png`, fullPage: true });
  }
});

test('mobile: multi-sale stepper fits at 320 and Generate is disabled at 0', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/sales/multi');
  await expect(page.getByRole('heading', { name: 'Bulk billing' })).toBeVisible();

  const fit = await page.evaluate(() => {
    const step = [...document.querySelectorAll('main section')].find(
      (s) => s.textContent?.includes('Billing') && s.textContent?.includes('Vegetables'),
    );
    if (!step) return { ok: false, reason: 'stepper not found' };
    const card = step.getBoundingClientRect();
    const buttons = [...step.querySelectorAll('button')];
    const last = buttons[buttons.length - 1].getBoundingClientRect();
    return {
      ok: last.right <= card.right + 1,
      lastRight: Math.round(last.right),
      cardRight: Math.round(card.right),
      vw: window.innerWidth,
    };
  });
  expect(fit.ok, JSON.stringify(fit)).toBe(true);

  await expect(page.getByRole('button', { name: /Generate/ })).toBeDisabled();
});
