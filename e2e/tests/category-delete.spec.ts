import { expect, test } from '@playwright/test';

test('delete a category with confirmation, show errors, and keep other categories', async ({ page }) => {
  let categories = [{ id: 10, name: 'Production', weight: null, criteria: [] }, { id: 20, name: 'Costume', weight: null, criteria: [] }];
  let deleteCalls = 0;
  let failDelete = false;
  const round = () => ({ id: 1, name: 'Opening', order: 1, kind: 'SCORED', status: 'PENDING', advanceCount: null, carryOverWeight: null, dropExtremes: false, tieBreak: 'SHARED_RANK', categories, _count: { entries: 1 } });
  const event = () => ({ id: 4, name: 'Review event', date: null, venue: null, status: 'DRAFT', testingMode: false, _count: { candidates: 1, judges: 1, rounds: 1 }, rounds: [round()], groups: [] });
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'admin', name: 'Admin' } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/events') return json([event()]);
    if (path === '/api/events/4') return json(event());
    if (path === '/api/events/4/rounds') return json([round()]);
    if (path === '/api/categories/10' && route.request().method() === 'DELETE') {
      deleteCalls++;
      if (failDelete) return json({ error: 'Category has scores.' }, 409);
      categories = categories.filter((c) => c.id !== 10);
      return route.fulfill({ status: 204 });
    }
    return route.abort();
  });
  await page.goto('/admin/events/4/rounds');
  const button = page.getByRole('button', { name: 'Delete category Production' });
  await expect(button).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());
  await button.click();
  expect(deleteCalls).toBe(0);
  failDelete = true;
  page.once('dialog', (dialog) => dialog.accept());
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Category has scores.');
  failDelete = false;
  page.once('dialog', (dialog) => dialog.accept());
  await button.click();
  await expect(button).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Costume' })).toBeVisible();
  expect(deleteCalls).toBe(2);
});
