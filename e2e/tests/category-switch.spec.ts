import { expect, test } from '@playwright/test';

test('category switching retains context and prevents loss after a failed save', async ({ page }) => {
  let failNextSave = true;
  let holdNextSave = false;
  let releaseSave: (() => void) | undefined;
  const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  const saved = new Map<string, number>();
  const categories = [
    { id: 10, name: 'Production', criteria: [{ id: 101, name: 'Performance', min: 0, max: 10, weight: null }], scored: 0, required: 25, submitted: false },
    { id: 20, name: 'Costume', criteria: [{ id: 201, name: 'Design', min: 0, max: 10, weight: null }], scored: 0, required: 25, submitted: false },
  ];
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') return json({ user: { id: 1, role: 'judge', name: 'Test judge', eventId: 1 } });
    if (url.pathname === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (url.pathname === '/api/judge/sheet') return json({ event: { id: 1, name: 'Test event', testingMode: false }, judge: { id: 1, name: 'Test judge' }, rounds: [{ id: 1, name: 'Opening', entries: 25, categories }], pairRounds: [], notScoring: [] });
    if (url.pathname === '/api/judge/scores') {
      if (failNextSave) {
        failNextSave = false;
        return json({ error: 'Connection failed' }, 503);
      }
      if (holdNextSave) {
        holdNextSave = false;
        await heldSave;
      }
      const body = route.request().postDataJSON();
      for (const s of body.scores) saved.set(`${body.categoryId}:${s.candidateId}:${s.criterionId}`, s.points);
      return json({ saved: body.scores.length });
    }
    const match = url.pathname.match(/^\/api\/judge\/categories\/(\d+)\/candidates$/);
    if (match) {
      const categoryId = Number(match[1]);
      const currentPage = Number(url.searchParams.get('page') ?? 1);
      const size = Number(url.searchParams.get('pageSize') ?? 20);
      const criterionId = categoryId === 10 ? 101 : 201;
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, number: i + 1, name: `Candidate ${i + 1}`, thumbUrl: null, photoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', scores: saved.has(`${categoryId}:${i + 1}:${criterionId}`) ? { [criterionId]: saved.get(`${categoryId}:${i + 1}:${criterionId}`) } : {} }));
      return json({ items: items.slice((currentPage - 1) * size, currentPage * size), total: 25, page: currentPage, pageSize: size });
    }
    return route.abort();
  });
  await page.goto('/judge');
  await expect(page.getByRole('heading', { name: /Opening: Production/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  const photo = page.getByRole('button', { name: 'Enlarge photo of Candidate 21' });
  await photo.click();
  await expect(page.getByRole('dialog', { name: 'Photo of Candidate 21' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photo).toBeFocused();
  const score = page.getByLabel('Performance for Candidate 21');
  await score.fill('11');
  await page.getByRole('tab', { name: /Costume/ }).click();
  await expect(page.getByText('Fix out-of-range scores before switching categories.')).toBeVisible();
  await score.fill('8');
  await page.getByRole('tab', { name: /Costume/ }).click();
  await expect(page.getByText('Connection failed')).toBeVisible();
  await expect(score).toHaveValue('8');
  await expect(page.getByRole('tab', { name: /Production/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.getByRole('tab', { name: /Costume/ }).click();
  await expect(page.getByLabel('Design for Candidate 21')).toBeVisible();
  holdNextSave = true;
  await page.getByLabel('Design for Candidate 21').fill('9');
  await page.getByRole('tab', { name: /Production/ }).click();
  await expect(page.getByRole('tab', { name: /Costume/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Production/ })).toBeDisabled();
  releaseSave!();
  await expect(page.getByLabel('Performance for Candidate 21')).toHaveValue('8');
  expect(saved.get('20:21:201')).toBe(9);
});
