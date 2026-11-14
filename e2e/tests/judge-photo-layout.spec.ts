import { expect, test } from '@playwright/test';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 320, height: 700 }]) {
  test(`judge photo keeps its shape and opens without nested buttons on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text());
    });
    const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="80"%3E%3Crect width="160" height="80" fill="red"/%3E%3C/svg%3E';
    const name = 'A Very Long Candidate Name That Needs Room';
    await page.addInitScript(() => localStorage.setItem('tabulation.token', 'mock-token'));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/auth/me') return json({ user: { id: 1, role: 'judge', name: 'Judge', eventId: 1 } });
      if (path === '/api/branding') return json({ appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null });
      if (path === '/api/judge/sheet') return json({ event: { id: 1, name: 'Event', testingMode: false }, judge: { id: 1, name: 'Judge' }, rounds: [{ id: 1, name: 'Opening', entries: 1, categories: [{ id: 10, name: 'Production', criteria: [{ id: 101, name: 'Performance', min: 0, max: 10, weight: null }], scored: 0, required: 1, submitted: false }] }], pairRounds: [], notScoring: [] });
      if (path === '/api/judge/categories/10/candidates') return json({ items: [{ id: 1, number: 1, name, thumbUrl: image, photoUrl: image, scores: {} }], total: 1, page: 1, pageSize: 20 });
      return route.abort();
    });
    await page.goto('/judge');
    const button = page.locator(`button:visible[aria-label="Enlarge photo of ${name}"]`);
    await expect(button).toBeVisible();
    await expect(page.locator('button button')).toHaveCount(0);
    const thumbnail = button.locator('img');
    const size = await thumbnail.boundingBox();
    expect(size?.width).toBeCloseTo(40, 0);
    expect(size?.height).toBeCloseTo(40, 0);
    await button.click();
    const dialog = page.getByRole('dialog', { name: `Photo of ${name}` });
    await expect(dialog).toBeVisible();
    const full = dialog.locator('img');
    await full.evaluate((img) => (img as HTMLImageElement).decode());
    const box = await full.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(2, 1);
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    expect(warnings.filter((text) => text.includes('validateDOMNesting'))).toEqual([]);
  });
}
