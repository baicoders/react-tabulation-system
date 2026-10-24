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
