import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteCandidatePicture, pictureUrls, saveCandidatePicture } from '../lib/images';
import { requireRole } from '../middleware/auth';

export const candidatesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

const id = z.coerce.number().int().positive();

// Lists stay fast with hundreds of candidates: the server pages and filters, the client never loads everything.
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  groupValueId: z.coerce.number().int().positive().optional(),
  roundId: z.coerce.number().int().positive().optional(),
});

const candidateSelect = {
  id: true,
  number: true,
  name: true,
  picturePath: true,
  groupValues: { select: { groupValue: { select: { id: true, name: true, groupId: true } } } },
} satisfies Prisma.CandidateSelect;

type CandidateRow = Prisma.CandidateGetPayload<{ select: typeof candidateSelect }>;

function toDto({ picturePath, groupValues, ...rest }: CandidateRow) {
  return { ...rest, ...pictureUrls(picturePath), groups: groupValues.map((g) => g.groupValue) };
}

candidatesRouter.get('/events/:eventId/candidates', requireRole('admin', 'judge'), async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  if (req.user?.role === 'judge' && req.user.eventId !== eventId) return res.status(403).json({ error: 'Not allowed' });

  const { page, pageSize, q, groupValueId, roundId } = listQuery.parse(req.query);
  const asNumber = q && /^\d+$/.test(q) ? Number(q) : undefined;
  const where: Prisma.CandidateWhereInput = {
    eventId,
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(asNumber ? [{ number: asNumber }] : [])] } : {}),
    ...(groupValueId ? { groupValues: { some: { groupValueId } } } : {}),
    ...(roundId ? { roundEntries: { some: { roundId } } } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      select: candidateSelect,
      orderBy: { number: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({ items: rows.map(toDto), total, page, pageSize });
});

const candidateBody = z.object({
  number: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  groupValueIds: z.array(z.number().int().positive()).default([]),
});

candidatesRouter.post('/events/:eventId/candidates', requireRole('admin'), async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const { groupValueIds, ...data } = candidateBody.parse(req.body);
  const created = await prisma.candidate.create({
    data: { ...data, eventId, groupValues: { create: groupValueIds.map((groupValueId) => ({ groupValueId })) } },
    select: candidateSelect,
  });
  res.status(201).json(toDto(created));
});

candidatesRouter.patch('/candidates/:id', requireRole('admin'), async (req, res) => {
  const { groupValueIds, ...data } = candidateBody.partial().parse(req.body);
  const updated = await prisma.candidate.update({
    where: { id: id.parse(req.params.id) },
    data: {
      ...data,
      ...(groupValueIds
        ? { groupValues: { deleteMany: {}, create: groupValueIds.map((groupValueId) => ({ groupValueId })) } }
        : {}),
    },
    select: candidateSelect,
  });
  res.json(toDto(updated));
});

candidatesRouter.delete('/candidates/:id', requireRole('admin'), async (req, res) => {
  const deleted = await prisma.candidate.delete({ where: { id: id.parse(req.params.id) } });
  await deleteCandidatePicture(deleted.picturePath);
  res.status(204).end();
});

candidatesRouter.post('/candidates/:id/picture', requireRole('admin'), upload.single('picture'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a JPG, PNG or WebP image up to 10 MB' });
  const candidateId = id.parse(req.params.id);
  const existing = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { picturePath: true } });
  if (!existing) return res.status(404).json({ error: 'Candidate not found' });

  const picturePath = await saveCandidatePicture(candidateId, req.file.buffer);
  const updated = await prisma.candidate.update({ where: { id: candidateId }, data: { picturePath }, select: candidateSelect });
  await deleteCandidatePicture(existing.picturePath);
  res.json(toDto(updated));
});
