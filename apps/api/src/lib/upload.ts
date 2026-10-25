import multer from 'multer';

export const MAX_PHOTO_MB = 25;

/** Image uploads (candidate photos, event logos), kept in memory because sharp resizes them before saving. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  // Phone photos run 3 to 15 MB; the server shrinks each one anyway.
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});
