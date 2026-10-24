import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

// Bulk import of candidates. The browser reads the CSV or Excel file and sends its rows; the same call checks them
// (dryRun) for the preview, then saves them. A row whose number already exists updates that candidate.
export const importRouter = Router();
const id = z.coerce.number().int().positive();

const body = z.object({
  dryRun: z.boolean().default(true),
  rows: z
    .array(
      z.object({
        line: z.number().int(),
        number: z.union([z.string(), z.number()]).nullable(),
        name: z.union([z.string(), z.number()]).nullable(),
        // Extra columns by header, matched to the event's groups by name ("House": "Red House").
        groups: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
      }),
    )
    .max(2000, 'Import at most 2,000 rows at a time'),
});

type RowResult = {
  line: number;
  number: number | null;
  name: string;
  status: 'new' | 'update' | 'error';
  error?: string;
  groups: Record<string, string>;
};

const norm = (s: string) => s.trim().toLowerCase();

importRouter.post('/events/:eventId/import/candidates', requireRole('admin'), async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const { dryRun, rows } = body.parse(req.body);

  const [groups, existing] = await Promise.all([
    prisma.group.findMany({ where: { eventId }, include: { values: true } }),
    prisma.candidate.findMany({ where: { eventId }, select: { id: true, number: true } }),
  ]);
  const groupByName = new Map(groups.map((g) => [norm(g.name), g]));
  const existingByNumber = new Map(existing.map((c) => [c.number, c.id]));

  const headers = new Set(rows.flatMap((r) => Object.keys(r.groups)));
  const ignoredColumns = [...headers].filter((h) => !groupByName.has(norm(h)));

  const seen = new Set<number>();
  const newValues = new Map<string, { group: string; value: string }>();
  const results: RowResult[] = rows.map((r) => {
    const name = String(r.name ?? '').trim().replace(/\s+/g, ' ');
    const raw = String(r.number ?? '').trim();
    const number = /^\d+$/.test(raw) ? Number(raw) : null;
    const groupsOut: Record<string, string> = {};
    for (const [header, value] of Object.entries(r.groups)) {
      const g = groupByName.get(norm(header));
      const v = String(value ?? '').trim();
      if (!g || !v) continue;
      const match = g.values.find((x) => norm(x.name) === norm(v));
      groupsOut[g.name] = match?.name ?? v;
      if (!match) newValues.set(`${g.id}:${norm(v)}`, { group: g.name, value: v });
    }
    const base = { line: r.line, number, name, groups: groupsOut };
    if (!name) return { ...base, status: 'error', error: 'Name is empty' };
    if (number === null || number < 1) return { ...base, status: 'error', error: raw ? `"${raw}" is not a candidate number` : 'Number is empty' };
    if (seen.has(number)) return { ...base, status: 'error', error: `No. ${number} appears earlier in the file` };
    seen.add(number);
    return { ...base, status: existingByNumber.has(number) ? 'update' : 'new' };
  });

  const counts = {
    new: results.filter((r) => r.status === 'new').length,
    update: results.filter((r) => r.status === 'update').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  if (dryRun) return res.json({ rows: results, newValues: [...newValues.values()], ignoredColumns, counts });

  // Save: create the new group values, then every valid row, in one transaction.
  await prisma.$transaction(async (tx) => {
    for (const nv of newValues.values()) {
      const g = groupByName.get(norm(nv.group))!;
      const created = await tx.groupValue.create({ data: { groupId: g.id, name: nv.value } });
      g.values.push(created);
    }
    for (const r of results) {
      if (r.status === 'error') continue;
      const valueIds = Object.entries(r.groups).map(([gName, vName]) => {
        const g = groupByName.get(norm(gName))!;
        return g.values.find((v) => norm(v.name) === norm(vName))!.id;
      });
      const groupIds = Object.keys(r.groups).map((gName) => groupByName.get(norm(gName))!.id);
      const candidate = await tx.candidate.upsert({
        where: { eventId_number: { eventId, number: r.number! } },
        create: { eventId, number: r.number!, name: r.name },
        update: { name: r.name },
      });
      // Replace only the groups the file has a column for; other groups keep their value.
      await tx.candidateGroupValue.deleteMany({ where: { candidateId: candidate.id, groupValue: { groupId: { in: groupIds } } } });
      if (valueIds.length) await tx.candidateGroupValue.createMany({ data: valueIds.map((groupValueId) => ({ candidateId: candidate.id, groupValueId })) });
    }
    await tx.auditLog.create({ data: { eventId, actor: req.user!.name, action: 'candidates.import', details: { ...counts, newValues: [...newValues.values()] } } });
  }, { timeout: 60_000 });

  res.json({ rows: results, newValues: [...newValues.values()], ignoredColumns, counts, saved: true });
});
