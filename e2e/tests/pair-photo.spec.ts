import { expect, test } from '@playwright/test';

test('enlarging a pair candidate photo does not cast a vote', async ({ page }) => {
  let votes = 0;
  const photo = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'judge', name: 'Judge', eventId: 1 } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/judge/sheet') return json({ event: { id: 1, name: 'Event', testingMode: false }, judge: { id: 1, name: 'Judge' }, rounds: [], notScoring: [], pairRounds: [{ id: 1, name: 'Debate', entries: 2, voted: 0, submitted: false, pairs: [{ id: 1, a: { id: 1, number: 1, name: 'Candidate One', thumbUrl: photo }, b: { id: 2, number: 2, name: 'Candidate Two', thumbUrl: photo }, myVote: null }] }] });
    if (path === '/api/judge/votes') { votes++; return json({}); }
    return route.abort();
  });
  await page.goto('/judge');
  const button = page.getByRole('button', { name: 'Enlarge photo of Candidate One' });
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Photo of Candidate One' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  expect(votes).toBe(0);
  await expect(page.getByRole('button', { name: 'Candidate One wins over Candidate Two' })).toHaveAttribute('aria-pressed', 'false');
});
