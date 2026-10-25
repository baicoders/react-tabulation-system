import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

export const UPLOADS_DIR = path.resolve('uploads');
const CANDIDATES_DIR = path.join(UPLOADS_DIR, 'candidates');

// Two sizes per candidate: a small thumbnail for lists and score sheets, a larger one for the profile view.
const SIZES = { thumb: 160, full: 800 } as const;

/**
 * Resizes an uploaded picture to WebP thumbnails and returns the base path stored on the candidate.
 * The timestamp in the name makes every upload a new URL, so browsers can cache images forever.
 */
export async function saveCandidatePicture(candidateId: number, input: Buffer): Promise<string> {
  await fs.mkdir(CANDIDATES_DIR, { recursive: true });
  const base = `candidates/${candidateId}-${Date.now()}`;
  await Promise.all(
    Object.entries(SIZES).map(([size, width]) =>
      sharp(input)
        .rotate()
        .resize({ width, height: width, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: size === 'thumb' ? 70 : 80 })
        .toFile(path.join(UPLOADS_DIR, `${base}-${size}.webp`)),
    ),
  );
  return base;
}

export async function deleteCandidatePicture(base: string | null): Promise<void> {
  if (!base) return;
  await Promise.all(
    Object.keys(SIZES).map((size) => fs.rm(path.join(UPLOADS_DIR, `${base}-${size}.webp`), { force: true })),
  );
}

export function pictureUrls(base: string | null) {
  return base ? { thumbUrl: `/uploads/${base}-thumb.webp`, photoUrl: `/uploads/${base}-full.webp` } : { thumbUrl: null, photoUrl: null };
}

const LOGO_SIZE = 512;

/**
 * Saves an event logo as a PNG that fits in 512 x 512. PNG, not WebP, so it stays crisp and keeps its
 * transparency in printouts and spreadsheets. Like candidate photos, a new name per upload keeps caching safe.
 */
export async function saveEventLogo(eventId: number, input: Buffer): Promise<string> {
  await fs.mkdir(path.join(UPLOADS_DIR, 'events'), { recursive: true });
  const file = `events/${eventId}-logo-${Date.now()}.png`;
  await sharp(input)
    .rotate()
    .resize({ width: LOGO_SIZE, height: LOGO_SIZE, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(UPLOADS_DIR, file));
  return file;
}

export async function deleteEventLogo(file: string | null): Promise<void> {
  if (file) await fs.rm(path.join(UPLOADS_DIR, file), { force: true });
}

/** The event as the client sees it: the stored logo path becomes a URL. */
export function withLogo<T extends { logoPath: string | null }>(event: T) {
  const { logoPath, ...rest } = event;
  return { ...rest, logoUrl: logoPath ? `/uploads/${logoPath}` : null };
}
