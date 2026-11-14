import { expect, test } from '@playwright/test';

test('a stage without an automatic cut is not described as the final round', async ({ page }) => {
  const round = { id: 1, name: 'Opening', order: 1, kind: 'SCORED', status: 'PENDING', advanceCount: null, carryOverWeight: null, dropExtremes: false, tieBreak: 'SHARED_RANK', categories: [], _count: { entries: 1 } };
  const event = { id: 4, name: 'Review event', date: null, venue: null, status: 'DRAFT', testingMode: false, _count: { candidates: 1, judges: 1, rounds: 1 }, rounds: [round], groups: [] };
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'admin', name: 'Admin' } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/events') return json([event]);
    if (path === '/api/events/4') return json(event);
    if (path === '/api/events/4/rounds') return json([round]);
    return route.abort();
  });
  await page.goto('/admin/events/4/rounds');
  const panel = page.locator('article.panel').filter({ hasText: 'Opening' });
  await expect(panel).toContainText('No automatic cut');
  await expect(panel).not.toContainText('Final round');
});
