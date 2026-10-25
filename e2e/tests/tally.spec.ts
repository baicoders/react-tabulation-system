import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  adminPassword,
  Api,
  closeRound,
  JUDGE_PASSWORD,
  JUDGES,
  judgeScoresOpenRound,
  judgeVotesOpenRound,
  loginUi,
  newPage,
  pageErrors,
  shot,
} from './helpers';

// The whole event day, in order: setup screens, judges scoring, live standings, every round, the reports.
// Each step saves screenshots into docs/screenshots for docs/screenshots.md.
test.describe.configure({ mode: 'serial' });

let admin: Api;
let eventId: number;
let rounds: { id: number; name: string; kind: string; status: string }[];

const roundId = (name: string) => rounds.find((r) => r.name === name)!.id;

async function adminPage(browser: Browser, opts?: Parameters<typeof newPage>[1]) {
  const page = await newPage(browser, opts);
  await loginUi(page, 'admin', 'admin', adminPassword());
  return page;
}

/** A plain head-and-shoulders placeholder portrait, drawn in the browser, so the lists show photos. */
async function portrait(page: Page, hue: number): Promise<Buffer> {
  await page.setContent(`
    <body style="margin:0">
      <svg id="p" width="600" height="800" viewBox="0 0 600 800" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 35% 78%)"/><stop offset="1" stop-color="hsl(${hue} 30% 58%)"/>
        </linearGradient></defs>
        <rect width="600" height="800" fill="url(#g)"/>
        <circle cx="300" cy="330" r="130" fill="hsl(${hue} 20% 32%)"/>
        <path d="M60 800 C80 580 190 500 300 500 C410 500 520 580 540 800 Z" fill="hsl(${hue} 22% 26%)"/>
      </svg>
    </body>`);
  return page.locator('#p').screenshot();
}

test.beforeAll(async () => {
  admin = await Api.login('admin', 'admin', adminPassword());
  const events = (await admin.call('/events')).data;
  const demo = events.find((e: any) => e.name.includes('(demo)'));
  expect(demo, 'run the demo seed first: docker compose exec api node dist/seed-demo.js').toBeTruthy();
  eventId = demo.id;
  // Repeatable runs: clear the demo's scores, open its first round, drop the event an earlier run created.
  for (const e of events.filter((e: any) => e.name === 'Sample Pageant (e2e)')) await admin.call(`/events/${e.id}`, 'DELETE');
  await admin.call(`/events/${eventId}`, 'PATCH', { testingMode: true });
  expect((await admin.call(`/events/${eventId}/start-over`, 'POST')).status).toBe(200);
  rounds = (await admin.call(`/events/${eventId}/rounds`)).data;
  expect((await admin.call(`/rounds/${roundId('Production Number')}/open`, 'POST')).status).toBe(200);
});

test('login: judge and admin, wrong password', async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in to score' })).toBeVisible();
  await shot(page, '01-login-judge');

  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.error')).toBeVisible();
  await shot(page, '02-login-error');

  await page.getByLabel('Password').fill(adminPassword());
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/admin/);
  await page.context().close();
});

test('events: list, filter tabs, search, create an event', async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto('/admin/events');
  await expect(page.getByRole('link', { name: /\(demo\)/ })).toBeVisible();
  await shot(page, '03-events');

  await page.getByRole('button', { name: 'New event' }).click();
  await page.getByLabel('Event name').fill('Sample Pageant (e2e)');
  await page.getByLabel('Venue').fill('Town plaza');
  await shot(page, '04-events-new');
  await page.getByRole('button', { name: /^(Create|Save|Add)/ }).first().click();
  // Creating an event opens it.
  await page.waitForURL(/\/admin\/events\/\d+$/);
  await expect(page.getByText('Sample Pageant (e2e)').first()).toBeVisible();
  await page.getByRole('link', { name: 'All events' }).click();

  await page.getByLabel('Search events').fill('sample');
  await expect(page.getByRole('link', { name: /\(demo\)/ })).toHaveCount(0);
  await page.getByLabel('Search events').fill('');
  await page.getByRole('tab', { name: /Setting up/ }).click();
  await expect(page.getByText('Sample Pageant (e2e)').first()).toBeVisible();
  await page.context().close();
});

test('import: candidates from a CSV into the new event', async ({ browser }) => {
  const page = await adminPage(browser);
  const events = (await admin.call('/events')).data;
  const sample = events.find((e: any) => e.name === 'Sample Pageant (e2e)');
  await page.goto(`/admin/events/${sample.id}/candidates`);
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByRole('heading', { name: 'Import candidates' })).toBeVisible();
  const csv = ['Number,Name', '1,Maria Santos', '2,Joy Villanueva', '3,Rica Ramos', '4,Lea Mendoza', '5,Kim Uy', '6,Ana Lim'].join('\n');
  await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'candidates.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Joy Villanueva')).toBeVisible();
  await shot(page, '08-import-preview');
  await page.getByRole('button', { name: /^Import \d+/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Imported 6 new candidates' })).toBeVisible();
  await shot(page, '08b-import-done');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'Rica Ramos' }).first()).toBeVisible();
  const list = (await admin.call(`/events/${sample.id}/candidates`)).data;
  expect(list.total).toBe(6);
  await page.context().close();
});

test('candidates: photos, search, group filter, pagination, add form', async ({ browser }) => {
  const page = await adminPage(browser);
  const first = (await admin.call(`/events/${eventId}/candidates?page=1&pageSize=20`)).data.items;

  // Photos: one through the page's own upload button, the rest through the API.
  const scratch = await page.context().newPage();
  const photos: Buffer[] = [];
  for (let i = 0; i < 20; i++) photos.push(await portrait(scratch, (i * 37) % 360));
  await scratch.close();
  for (let i = 1; i < first.length; i++) {
    const form = new FormData();
    form.append('picture', new Blob([photos[i]], { type: 'image/png' }), `p${i}.png`);
    expect((await admin.call(`/candidates/${first[i].id}/picture`, 'POST', undefined, form)).status).toBe(200);
  }
  await page.goto(`/admin/events/${eventId}/candidates`);
  await page.locator('input[type=file][accept*=image]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photos[0] });
  await expect(page.locator('tbody tr').first().locator('img')).toBeVisible();
  await shot(page, '05-candidates');

  await page.getByLabel('Search candidates').fill('gonzaga');
  await expect(page.locator('tbody tr')).not.toHaveCount(20);
  await shot(page, '06-candidates-search');
  await page.getByLabel('Search candidates').fill('');

  const filter = page.getByLabel('Filter by group');
  await filter.selectOption({ label: (await filter.locator('option').nth(1).textContent())! });
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await filter.selectOption({ index: 0 });

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('cell', { name: '21', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();

  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByRole('heading', { name: 'Add candidate' })).toBeVisible();
  await page.getByLabel('Full name').fill('New Candidate');
  await shot(page, '07-candidates-add');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.context().close();
});

test('groups, rounds and criteria, judges', async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto(`/admin/events/${eventId}/groups`);
  await expect(page.getByRole('heading', { name: 'House' })).toBeVisible();
  await shot(page, '09-groups');

  await page.goto(`/admin/events/${eventId}/rounds`);
  await expect(page.getByRole('heading', { name: 'Production Number' })).toBeVisible();
  await shot(page, '10-rounds');

  await page.goto(`/admin/events/${eventId}/judges`);
  await expect(page.getByRole('checkbox', { name: 'Marites Uy scores Production Number' })).toBeChecked();
  await shot(page, '11-judges');
  await page.getByRole('button', { name: 'Add judge' }).click();
  await page.getByLabel('Name (also the username)').fill('Guest Judge');
  await shot(page, '12-judges-add');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.context().close();
});

test('judging: score sheet, live standings on the admin screen, submit, close the round', async ({ browser }) => {
  const overview = await adminPage(browser);
  await overview.goto(`/admin/events/${eventId}`);
  await expect(overview.getByRole('heading', { name: 'Standings in Production Number' })).toBeVisible();
  await overview.evaluate(() => ((window as any).__sameDocument = true));
  await shot(overview, '13-overview-open-round');

  const judge = await newPage(browser);
  await loginUi(judge, 'judge', 'Marites Uy', JUDGE_PASSWORD);
  await expect(judge.getByRole('heading', { name: 'Production Number' })).toBeVisible();
  await shot(judge, '14-judge-sheet-empty');

  // Type a few scores by hand, then fill the rest with the testing-mode shortcut.
  await judge.getByLabel('Stage presence for Andrea Abellana').fill('9');
  await judge.getByLabel('National costume for Andrea Abellana').fill('8');
  await judge.getByLabel('Poise and projection for Andrea Abellana').fill('10');
  await judge.getByLabel('Poise and projection for Andrea Abellana').blur();
  await expect(judge.locator('tbody tr').first()).not.toContainText(/-\s*$/);
  await shot(judge, '15-judge-sheet-typing');

  // The admin overview updates by itself, without reloading the page.
  await expect(overview.getByText(/Live, updated/)).toBeVisible();
  // The shortcut fills the page on screen, so page through the sheet.
  const next = judge.getByRole('button', { name: 'Next page' });
  for (;;) {
    await judge.keyboard.press('Shift+J');
    await expect(judge.locator('tbody input:placeholder-shown, tbody input[value=""]')).toHaveCount(0);
    if (!(await next.isEnabled())) break;
    await next.click();
    await expect(judge.locator('tbody[class=loading]')).toHaveCount(0);
  }
  await expect(judge.getByRole('button', { name: 'Submit Production Number' })).toBeEnabled();
  await shot(judge, '16-judge-sheet-filled');
  await judge.getByRole('button', { name: 'Submit Production Number' }).click();
  await expect(judge.getByText(/submitted/i).first()).toBeVisible();
  await shot(judge, '17-judge-submitted');

  for (const name of JUDGES.filter((n) => n !== 'Marites Uy')) await judgeScoresOpenRound(await Api.login('judge', name, JUDGE_PASSWORD));
  const close = overview.getByRole('button', { name: 'Close Production Number' });
  await expect(close).toBeEnabled();
  expect(await overview.evaluate(() => (window as any).__sameDocument)).toBe(true);
  await shot(overview, '18-overview-all-submitted');

  await close.click();
  // Random scores can tie at the cut-off; the tabulator then decides to send every tied candidate on.
  const openNext = overview.getByRole('button', { name: /Open One Minute Speech/ });
  const sendAll = overview.getByRole('button', { name: /^Send all \d+ on$/ });
  await expect(openNext.or(sendAll)).toBeVisible();
  if (await sendAll.isVisible()) {
    await shot(overview, '19a-overview-tie-at-cut');
    await sendAll.click();
  }
  await expect(openNext).toBeVisible();
  await shot(overview, '19-overview-round-closed');
  await overview.getByRole('button', { name: /Open One Minute Speech/ }).click();
  await expect(overview.getByRole('heading', { name: 'Standings in One Minute Speech' })).toBeVisible();
  await judge.context().close();
  await overview.context().close();
});

test('later rounds and the pair vote (Deba Teh)', async ({ browser }) => {
  for (const name of ['One Minute Speech', 'Gown Competition']) {
    if (name !== 'One Minute Speech') expect((await admin.call(`/rounds/${roundId(name)}/open`, 'POST')).status).toBe(200);
    for (const j of JUDGES) await judgeScoresOpenRound(await Api.login('judge', j, JUDGE_PASSWORD));
    await closeRound(admin, roundId(name));
  }
  expect((await admin.call(`/rounds/${roundId('Deba Teh')}/open`, 'POST')).status).toBe(200);

  const overview = await adminPage(browser);
  await overview.goto(`/admin/events/${eventId}`);
  await expect(overview.getByRole('heading', { name: 'Pairs for Deba Teh' })).toBeVisible();
  await shot(overview, '20-overview-pairs-unset');
  await overview.getByRole('button', { name: /rank/i }).first().click();
  await expect(overview.getByRole('heading', { name: 'Votes in Deba Teh' })).toBeVisible();

  const judge = await newPage(browser);
  await loginUi(judge, 'judge', 'Marites Uy', JUDGE_PASSWORD);
  await expect(judge.getByRole('heading', { name: 'Deba Teh' })).toBeVisible();
  await shot(judge, '21-judge-pair-vote');
  const picks = judge.getByRole('button', { name: / wins over / });
  const pairs = (await picks.count()) / 2;
  for (let i = 0; i < pairs; i++) await picks.nth(i * 2).click();
  await shot(judge, '22-judge-pair-voted');
  await judge.getByRole('button', { name: /^Submit/ }).click();
  await expect(judge.getByText(/submitted/i).first()).toBeVisible();

  for (const j of JUDGES.filter((n) => n !== 'Marites Uy')) await judgeVotesOpenRound(await Api.login('judge', j, JUDGE_PASSWORD));
  await expect(overview.getByRole('button', { name: 'Close Deba Teh' })).toBeEnabled();
  await shot(overview, '23-overview-votes-in');
  await closeRound(admin, roundId('Deba Teh'));

  for (const name of ['Witty Questions', 'Final Question']) {
    expect((await admin.call(`/rounds/${roundId(name)}/open`, 'POST')).status).toBe(200);
    for (const j of JUDGES) await judgeScoresOpenRound(await Api.login('judge', j, JUDGE_PASSWORD));
    await closeRound(admin, roundId(name));
  }
  await overview.reload();
  await shot(overview, '24-overview-final', true);
  await judge.context().close();
  await overview.context().close();
});

test('reports: overall, by round, by candidate, by judge, split by group, Excel', async ({ browser }) => {
  const page = await adminPage(browser);
  await page.goto(`/admin/events/${eventId}/reports`);
  await expect(page.getByRole('heading', { name: 'Overall ranking', level: 2 })).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await shot(page, '25-report-overall');

  const views: [string, string, string | null][] = [
    ['By round', '26-report-round', null],
    ['By candidate', '27-report-candidate', 'Candidate'],
    ['By judge', '28-report-judge', 'Judge'],
  ];
  for (const [tab, file, pick] of views) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    if (pick) await page.getByRole('combobox', { name: pick, exact: true }).selectOption({ index: 1 });
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await shot(page, file);
  }

  await page.getByRole('tab', { name: 'Overall ranking' }).click();
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(60);
  const allRows = await rows.count();
  await page.getByLabel('Split by group').selectOption({ label: 'Red House only' });
  await expect.poll(() => rows.count()).toBeLessThan(allRows);
  await shot(page, '29-report-split-by-group');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.context().close();
});

test('phone and tablet layouts', async ({ browser }) => {
  const phone = await adminPage(browser, { width: 390, height: 844, mobile: true });
  await phone.goto(`/admin/events/${eventId}/reports`);
  await expect(phone.locator('table tbody tr').first()).toBeVisible();
  await shot(phone, '30-phone-report');
  // Ranking tables fit the phone; no column pushes the page sideways.
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const wrap = phone.locator('.table-wrap').first();
  expect(await wrap.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  const phoneViews: [string, string, string | null][] = [
    ['By round', '30b-phone-report-round', null],
    ['By candidate', '30c-phone-report-candidate', 'Candidate'],
    ['By judge', '30d-phone-report-judge', 'Judge'],
  ];
  for (const [tab, file, pick] of phoneViews) {
    await phone.getByRole('tab', { name: tab }).click();
    if (pick) await phone.getByRole('combobox', { name: pick, exact: true }).selectOption({ index: 1 });
    await expect(phone.locator('table tbody tr').first()).toBeVisible();
    await shot(phone, file);
    // Wide score grids scroll inside their box, never the page.
    expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  // Printing keeps every column, even though A4 is narrower than the phone breakpoint.
  await phone.getByRole('tab', { name: 'Overall ranking' }).click();
  await phone.emulateMedia({ media: 'print' });
  await expect(phone.getByRole('columnheader', { name: 'Furthest round' })).toBeVisible();
  await phone.emulateMedia({ media: 'screen' });
  await expect(phone.getByRole('columnheader', { name: 'Furthest round' })).toBeHidden();

  await phone.getByRole('button', { name: 'Open menu' }).click();
  await shot(phone, '31-phone-menu');
  await phone.context().close();

  // A judge on a tablet: reopen the first round as a fresh test so there is a sheet to show.
  const tablet = await newPage(browser, { width: 820, height: 1180, mobile: true });
  await loginUi(tablet, 'judge', 'Jun Tiu', JUDGE_PASSWORD);
  await shot(tablet, '32-tablet-judge-no-round');
  await tablet.context().close();
});

test.afterEach(() => {
  const errors = pageErrors.splice(0);
  expect(errors, 'script errors in the app').toEqual([]);
});
