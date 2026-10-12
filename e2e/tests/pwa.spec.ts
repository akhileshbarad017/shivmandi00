import { test, expect, type Page } from '@playwright/test';

/**
 * The PWA is served by Express from the production build (same origin as /api),
 * so these tests target port 4000 rather than the Vite dev server.
 */
const BASE = 'http://localhost:4000';

async function buildAvailable(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(`${BASE}/manifest.webmanifest`);
    return res.ok();
  } catch {
    return false;
  }
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/Username or mobile/).fill('admin');
  await page.getByLabel(/Password/).fill('admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${BASE}/`);
}

test('pwa: registers a service worker and serves the manifest', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  test.skip(!(await buildAvailable(page)), 'production build not served on :4000');

  await signIn(page);
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  }, null, { timeout: 15_000 });
  const controlled = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  });
  expect(controlled.active).toBe(true);
  expect(controlled.scope).toContain(BASE);
});

test('pwa: offline reload keeps the shell and cached session', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  test.skip(!(await buildAvailable(page)), 'production build not served on :4000');

  await signIn(page);
  await page.goto(`${BASE}/sales/new`);
  await page.waitForTimeout(1000);

  // Let the SW take control, then go offline and reload.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForTimeout(800);
  await page.context().setOffline(true);
  await page.goto(`${BASE}/sales/new`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => ({
    onLine: navigator.onLine,
    hasShell: !!document.querySelector('main'),
    path: location.pathname,
  }));
  expect(state.onLine).toBe(false);
  expect(state.hasShell).toBe(true);
  expect(state.path).toBe('/sales/new');
  await page.context().setOffline(false);
});

test('pwa: offline sale syncs exactly once on reconnect', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile only');
  test.skip(!(await buildAvailable(page)), 'production build not served on :4000');

  const buyer = `PW Offline ${Date.now()}`;
  await signIn(page);
  await page.goto(`${BASE}/sales/new`);
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForTimeout(800);

  await page.context().setOffline(true);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Walk-in' }).click();
  await page.getByLabel(/Buyer name/).fill(buyer);
  await page.getByRole('combobox', { name: /Product/ }).first().selectOption({ index: 1 });
  await page.getByLabel(/Qty/).first().fill('3');
  await page.getByLabel(/Rate/).first().fill('25');
  await page.getByRole('button', { name: /Save & bill/ }).first().dispatchEvent('click');

  // The write is queued in the IndexedDB outbox instead of hitting the network.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const raw = await new Promise<{ ops?: unknown[] } | null>((resolve) => {
            const req = indexedDB.open('keyval-store');
            req.onsuccess = () => {
              const tx = req.result.transaction('keyval', 'readonly');
              const g = tx.objectStore('keyval').get('vp.mandi.outbox');
              g.onsuccess = () => resolve(g.result as { ops?: unknown[] } | null);
              g.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
          });
          return raw?.ops?.length ?? 0;
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  // Reconnect → outbox drains → exactly one invoice for this buyer.
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect
    .poll(
      async () =>
        page.evaluate(async (name: string) => {
          const sales = await fetch('/api/sales').then((r) => r.json());
          const bills = (sales.items ?? []).filter(
            (s: { buyer_name: string }) => s.buyer_name === name,
          );
          return bills.length;
        }, buyer),
      { timeout: 20_000 },
    )
    .toBe(1);

  await page.waitForTimeout(500);
  const remaining = await page.evaluate(async () => {
    const raw = await new Promise<{ ops?: unknown[]; failed?: unknown[] } | null>((resolve) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const tx = req.result.transaction('keyval', 'readonly');
        const g = tx.objectStore('keyval').get('vp.mandi.outbox');
        g.onsuccess = () => resolve(g.result as { ops?: unknown[]; failed?: unknown[] } | null);
        g.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
    return { ops: raw?.ops?.length ?? 0, failed: raw?.failed?.length ?? 0 };
  });
  expect(remaining.ops).toBe(0);
  expect(remaining.failed).toBe(0);
});
