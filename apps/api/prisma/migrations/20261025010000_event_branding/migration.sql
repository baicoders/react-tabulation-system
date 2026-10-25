-- Per-event branding: who runs it, their logo and colour, shown on screens and printed reports.
ALTER TABLE "Event" ADD COLUMN "organization" TEXT;
ALTER TABLE "Event" ADD COLUMN "logoPath" TEXT;
ALTER TABLE "Event" ADD COLUMN "brandColor" TEXT;
