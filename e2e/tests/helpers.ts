import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';

export const BASE = process.env.BASE_URL ?? 'http://localhost:8090';
export const SHOTS = path.resolve(__dirname, '../../docs/screenshots');
mkdirSync(SHOTS, { recursive: true });

/** ADMIN_PASSWORD from the environment, else from the repo's .env. */
export function adminPassword(): string {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const env = readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('ADMIN_PASSWORD='));
  if (!line) throw new Error('Set ADMIN_PASSWORD or add it to .env');
  return line.slice('ADMIN_PASSWORD='.length).trim();
}

export const JUDGES = ['Cecilia Ong', 'Jun Tiu', 'Lorna Pacaña', 'Marites Uy', 'Ramon Sabandal'];
export const JUDGE_PASSWORD = 'judge1234';

/** Saves a screenshot into docs/screenshots. Waits for fonts and images first. */
export async function shot(page: Page, name: string, fullPage = false) {
  // Not 'networkidle': screens with live updates keep their event stream open, so the network never idles.
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    // Lazy images below the fold never load, so the wait is capped.
    const images = Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
    await Promise.race([images, new Promise((r) => setTimeout(r, 2000))]);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage, animations: 'disabled' });
}

export async function loginUi(page: Page, role: 'admin' | 'judge', name: string, password: string) {
  await page.goto('/login');
  if (role === 'admin') await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByLabel(role === 'admin' ? 'Username' : 'Your name').fill(name);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(role === 'admin' ? /\/admin/ : /\/judge/);
}

export const pageErrors: string[] = [];

export async function newPage(browser: Browser, opts: { width?: number; height?: number; mobile?: boolean } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    deviceScaleFactor: opts.mobile ? 2 : 1,
    isMobile: opts.mobile,
    hasTouch: opts.mobile,
  });
  const page = await context.newPage();
  // The app asks before destructive or locking actions; the tests answer yes.
  page.on('dialog', (d) => d.accept());
  // A script error in the app fails the test that caused it.
  page.on('pageerror', (err) => {
    pageErrors.push(`${page.url()}: ${err.message}`);
  });
  return page;
}

/** Thin API client for the steps the UI tests do not need to click through (other judges, later rounds). */
export class Api {
  constructor(private token: string) {}

  static async login(role: 'admin' | 'judge', username: string, password: string) {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, password }),
    });
    const body = await r.json();
    expect(r.status, `login ${username}`).toBe(200);
    return new Api(body.token);
  }

  async call<T = any>(urlPath: string, method = 'GET', body?: unknown, raw?: FormData): Promise<{ status: number; data: T }> {
    const r = await fetch(`${BASE}/api${urlPath}`, {
      method,
      headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${this.token}` },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await r.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: r.status, data };
  }
}

/** A judge scores every candidate in the open scored round at random and submits. */
export async function judgeScoresOpenRound(judge: Api) {
  const sheet = (await judge.call('/judge/sheet')).data;
  const round = sheet.rounds.find((r: any) => r.kind === 'SCORED');
  for (const category of round.categories) {
    const all = (await judge.call(`/judge/categories/${category.id}/candidates?pageSize=100`)).data;
    const scores = all.items.flatMap((c: any) =>
      category.criteria.map((cr: any) => ({ candidateId: c.id, criterionId: cr.id, points: cr.min + Math.floor(Math.random() * (cr.max - cr.min + 1)) })),
    );
    expect((await judge.call('/judge/scores', 'PUT', { categoryId: category.id, scores })).status).toBe(200);
    expect((await judge.call(`/judge/categories/${category.id}/submit`, 'POST')).status).toBe(200);
  }
}

/** A judge votes in every pair of the open pair-vote round and submits. */
export async function judgeVotesOpenRound(judge: Api) {
  const sheet = (await judge.call('/judge/sheet')).data;
  const round = sheet.pairRounds[0];
  for (const pair of round.pairs) {
    const winner = Math.random() < 0.5 ? pair.a.id : pair.b.id;
    expect((await judge.call('/judge/votes', 'PUT', { pairId: pair.id, winnerId: winner })).status).toBe(200);
  }
  expect((await judge.call(`/judge/rounds/${round.id}/submit-votes`, 'POST')).status).toBe(200);
}

/** Closes a round, taking tied candidates along when the cut-off is tied. */
export async function closeRound(admin: Api, roundId: number) {
  let r = await admin.call(`/rounds/${roundId}/close`, 'POST', {});
  if (r.status === 409 && r.data.tie) r = await admin.call(`/rounds/${roundId}/close`, 'POST', { includeTies: true });
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return r.data;
}
