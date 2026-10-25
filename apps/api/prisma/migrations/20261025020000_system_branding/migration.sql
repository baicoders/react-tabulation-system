-- Branding belongs to the whole system (the school running it), not to one event.
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appName" TEXT NOT NULL DEFAULT 'Tally',
    "organization" TEXT,
    "logoPath" TEXT,
    "brandColor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- Keep branding already set on an event: the most recently updated one with a logo or organization.
INSERT INTO "Settings" ("id", "organization", "logoPath", "brandColor")
SELECT 1, "organization", "logoPath", "brandColor" FROM "Event"
WHERE "logoPath" IS NOT NULL OR "organization" IS NOT NULL
ORDER BY "updatedAt" DESC
LIMIT 1;
INSERT INTO "Settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE "Event" DROP COLUMN "organization";
ALTER TABLE "Event" DROP COLUMN "logoPath";
ALTER TABLE "Event" DROP COLUMN "brandColor";
