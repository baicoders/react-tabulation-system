import { expect, test } from '@playwright/test';

test('category report does not crash while rounds and results are loading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const category = { id: 10, name: 'Production' };
  const round = { id: 1, name: 'Opening', kind: 'SCORED', status: 'CLOSED', _count: { entries: 1 }, categories: [category] };
  const event = { id: 4, name: 'Review event', date: null, venue: null, status: 'CLOSED', testingMode: false, _count: { candidates: 1, judges: 1, rounds: 1 }, rounds: [round], groups: [] };
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'admin', name: 'Admin' } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/events') return json([event]);
    if (path === '/api/events/4') return json(event);
    if (path === '/api/events/4/rounds') return json([round]);
    if (path === '/api/events/4/judges') return json([{ id: 1, name: 'Judge One' }]);
    if (path === '/api/categories/10/report') return json({ category, round, groupValueId: null, judges: 1, totalJudges: 1, judgeNames: ['Judge One'], judgesSubmitted: 1, complete: true, rows: [{ candidate: { id: 1, number: 1, name: 'Candidate One', groups: [] }, rank: 1, score: 80, rawTotal: 8, rawPercentage: 80 }] });
    return route.abort();
  });
  await page.goto('/admin/events/4/reports?view=category');
  await expect(page.getByRole('heading', { name: 'Production ranking' })).toBeVisible();
  await expect(page.getByText('Candidate One')).toBeVisible();
  expect(errors).toEqual([]);
});
