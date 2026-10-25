import { Router } from 'express';
import { z } from 'zod';
import { deleteLogo, saveLogo, withLogo } from '../lib/images';
import { prisma } from '../lib/prisma';
import { MAX_PHOTO_MB, imageUpload } from '../lib/upload';
import { requireRole } from '../middleware/auth';

// The system's identity: the school's name, logo and colour, on every screen and every event's printouts.
export const settingsRouter = Router();

/** The one settings row, created with defaults the first time it is read. */
export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

function branding(settings: Awaited<ReturnType<typeof getSettings>>) {
  const { id: _id, updatedAt: _updated, ...rest } = withLogo(settings);
  return rest;
}

// Public, for the login page before anyone logs in: the branding and the live event's name, date and venue.
settingsRouter.get('/branding', async (_req, res) => {
  const [settings, live] = await Promise.all([
    getSettings(),
    prisma.event.findFirst({ where: { status: 'ACTIVE' }, select: { name: true, date: true, venue: true } }),
  ]);
  res.json({ ...branding(settings), liveEvent: live });
});

const settingsSchema = z.object({
  appName: z.string().trim().min(1).max(60).optional(),
  organization: z.string().trim().max(120).nullable().optional(),
  // A hex colour like #03053e: the rule under printed letterheads and the accent beside the name.
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #03053e').nullable().optional(),
});

settingsRouter.patch('/settings', requireRole('admin'), async (req, res) => {
  const data = settingsSchema.parse(req.body);
  await getSettings();
  res.json(branding(await prisma.settings.update({ where: { id: 1 }, data })));
});

settingsRouter.post('/settings/logo', requireRole('admin'), imageUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: `Upload a JPG, PNG or WebP image up to ${MAX_PHOTO_MB} MB` });
  const before = await getSettings();
  const logoPath = await saveLogo(req.file.buffer);
  const updated = await prisma.settings.update({ where: { id: 1 }, data: { logoPath } });
  await deleteLogo(before.logoPath);
  res.json(branding(updated));
});

settingsRouter.delete('/settings/logo', requireRole('admin'), async (_req, res) => {
  const before = await getSettings();
  const updated = await prisma.settings.update({ where: { id: 1 }, data: { logoPath: null } });
  await deleteLogo(before.logoPath);
  res.json(branding(updated));
});
