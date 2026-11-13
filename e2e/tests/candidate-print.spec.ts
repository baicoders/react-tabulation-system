import { execFileSync, spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('candidate report starts the first stage on page one and continues across pages', async ({ page }) => {
  test.skip(spawnSync('pdftotext', ['-v']).error !== undefined, 'pdftotext is required to inspect printed pages');
  const candidate = { id: 1, number: 21, name: 'Candidate One', thumbUrl: null, groups: [] };
  const event = { id: 1, name: 'Review event', date: null, venue: null, status: 'CLOSED', testingMode: false, _count: { candidates: 1, judges: 1, rounds: 1 }, rounds: [], groups: [] };
  const criteria = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Criterion ${i + 1}`, max: 10, weight: null, points: { 1: 8 } }));
  await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/me') return json({ user: { id: 1, role: 'admin', name: 'Admin' } });
    if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
    if (path === '/api/events') return json([event]);
    if (path === '/api/events/1') return json(event);
    if (path === '/api/events/1/candidates') return json({ items: [candidate] });
    if (path === '/api/candidates/1/report') return json({ candidate, judges: [{ id: 1, name: 'Judge One' }], rounds: [{ id: 1, name: 'Opening', kind: 'SCORED', status: 'CLOSED', rank: 1, score: 80, advanced: true, categories: [{ id: 1, name: 'Production', criteria }], pair: null }] });
    return route.abort();
  });
  await page.goto('/admin/events/1/reports?view=candidate&candidate=1');
  await expect(page.getByRole('cell', { name: /Criterion 1/ }).first()).toBeVisible();
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  const firstPage = execFileSync('pdftotext', ['-f', '1', '-l', '1', '-layout', '-', '-'], { input: pdf }).toString();
  const allPages = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf }).toString();
  expect(firstPage).toContain('Stage: Opening');
  expect(firstPage).toContain('Criterion 1');
  expect(allPages).toContain('Criterion 30');
  expect(allPages.split('\f').length).toBeGreaterThan(2);
});
