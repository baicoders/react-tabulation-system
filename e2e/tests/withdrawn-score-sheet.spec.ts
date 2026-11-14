import { expect, test } from '@playwright/test';

test('withdrawn candidate remains on the judge sheet without score inputs', async ({ page }) => {
  const saves: { candidateId: number }[] = [];
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'judge', name: 'Judge', eventId: 1 } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/judge/sheet') return json({ event: { id: 1, name: 'Event', testingMode: false }, judge: { id: 1, name: 'Judge' }, rounds: [{ id: 1, name: 'Opening', entries: 1, categories: [{ id: 10, name: 'Production', criteria: [{ id: 101, name: 'Performance', min: 0, max: 10, weight: null }], scored: 0, required: 1, submitted: false }] }], pairRounds: [], notScoring: [] });
    if (path === '/api/judge/categories/10/candidates') return json({ items: [{ id: 1, number: 1, name: 'Withdrawn Candidate', withdrawn: true, thumbUrl: null, photoUrl: null, scores: { 101: 9 } }, { id: 2, number: 2, name: 'Active Candidate', withdrawn: false, thumbUrl: null, photoUrl: null, scores: {} }], total: 2, page: 1, pageSize: 20 });
    if (path === '/api/judge/scores') { saves.push(...route.request().postDataJSON().scores); return json({ saved: true }); }
    return route.abort();
  });
  await page.goto('/judge');
  const withdrawn = page.getByRole('row').filter({ hasText: 'Withdrawn Candidate' });
  await expect(withdrawn).toContainText('Withdrawn');
  await expect(withdrawn.locator('input')).toHaveCount(0);
  const activeScore = page.locator('input:visible[aria-label="Performance for Active Candidate"]');
  await expect(activeScore).toBeVisible();
  await activeScore.fill('8');
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].candidateId).toBe(2);
});

test('withdrawn candidate has no inputs on the phone score card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'judge', name: 'Judge', eventId: 1 } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/judge/sheet') return json({ event: { id: 1, name: 'Event', testingMode: false }, judge: { id: 1, name: 'Judge' }, rounds: [{ id: 1, name: 'Opening', entries: 1, categories: [{ id: 10, name: 'Production', criteria: [{ id: 101, name: 'Performance', min: 0, max: 10, weight: null }], scored: 0, required: 1, submitted: false }] }], pairRounds: [], notScoring: [] });
    if (path === '/api/judge/categories/10/candidates') return json({ items: [{ id: 1, number: 1, name: 'Withdrawn Candidate', withdrawn: true, thumbUrl: null, photoUrl: null, scores: { 101: 9 } }, { id: 2, number: 2, name: 'Active Candidate', withdrawn: false, thumbUrl: null, photoUrl: null, scores: {} }], total: 2, page: 1, pageSize: 20 });
    return route.abort();
  });
  await page.goto('/judge');
  const card = page.getByRole('article', { name: 'Withdrawn Candidate, candidate 1' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Withdrawn');
  await expect(card.locator('input')).toHaveCount(0);
  await expect(page.locator('input:visible[aria-label="Performance for Active Candidate"]')).toBeVisible();
});
