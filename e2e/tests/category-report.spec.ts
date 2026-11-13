import { expect, test } from '@playwright/test';

test('category report loads, switches filters, refreshes, and retries errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let fail = false;
  const categories = [{ id: 10, name: 'Production' }, { id: 20, name: 'Costume' }];
  const round = { id: 1, name: 'Opening', kind: 'SCORED', status: 'CLOSED', _count: { entries: 2 }, categories };
  const event = { id: 4, name: 'Review event', date: null, venue: null, status: 'CLOSED', testingMode: false, _count: { candidates: 2, judges: 1, rounds: 1 }, rounds: [round], groups: [{ id: 1, name: 'Country', values: [{ id: 5, name: 'Angola', groupId: 1 }] }] };
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') return json({ user: { id: 1, role: 'admin', name: 'Admin' } });
    if (url.pathname === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (url.pathname === '/api/events') return json([event]);
    if (url.pathname === '/api/events/4') return json(event);
    if (url.pathname === '/api/events/4/rounds') return json([round]);
    if (url.pathname === '/api/events/4/judges') return json([{ id: 1, name: 'Judge One' }]);
    if (url.pathname === '/api/events/4/reports/combined-categories') return json({ categories: [{ id: 10, name: 'Production', roundName: 'Opening', weight: 1 }, { id: 20, name: 'Costume', roundName: 'Opening', weight: 1 }], rows: [{ candidate: { id: 1, number: 1, name: 'Candidate One', thumbUrl: null, groups: [] }, values: [8, 9], total: 17, percentage: 85, rank: 1 }] });
    const match = url.pathname.match(/^\/api\/categories\/(\d+)\/report$/);
    if (match) {
      if (fail) return json({ error: 'Unavailable' }, 503);
      const category = categories.find((c) => c.id === Number(match[1]))!;
      return json({ category, round, groupValueId: url.searchParams.has('groupValueId') ? 5 : null, judges: 1, totalJudges: 1, judgeNames: ['Judge One'], judgesSubmitted: 1, complete: true, rows: [{ candidate: { id: 1, number: 1, name: 'Candidate One', thumbUrl: null, groups: [] }, rank: 1, score: 80, rawTotal: 8, rawPercentage: 80 }] });
    }
    return route.abort();
  });
  await page.goto('/admin/events/4/reports?view=category');
  await expect(page.getByRole('heading', { name: 'Production ranking' })).toBeVisible();
  await expect(page.getByText('Candidate One')).toBeVisible();
  await expect(page).toHaveTitle('Tally | Reports - By Category');
  const rankHeader = page.getByRole('columnheader', { name: 'Rank', exact: true });
  expect((await rankHeader.boundingBox())!.width).toBeLessThan(80);
  await expect(page.getByRole('columnheader', { name: 'Ranking score / 100' })).toHaveCount(0);
  await page.getByLabel('Show all columns').check();
  await expect(page.getByRole('columnheader', { name: 'Ranking score / 100' })).toBeVisible();
  await page.getByLabel('Category', { exact: true }).selectOption('20');
  await page.getByLabel('Split by group').selectOption('5');
  await expect(page.getByRole('heading', { name: /Costume ranking, Country: Angola/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Candidate One')).toBeVisible();
  fail = true;
  await page.getByLabel('Category', { exact: true }).selectOption('10');
  await expect(page.getByText('Couldn’t load this report.')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Candidate One')).toBeVisible();
  await page.getByRole('tab', { name: 'Combined categories' }).click();
  await expect(page).toHaveTitle('Tally | Reports - Combined Categories');
  await page.getByLabel('Production (Opening)').check();
  await page.getByLabel('Costume (Opening)').check();
  await expect(page.getByLabel('Production multiplier')).toHaveCount(0);
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByText('17.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Advanced weights' }).click();
  await expect(page.getByLabel('Production multiplier')).toBeVisible();
  expect(errors).toEqual([]);
});
