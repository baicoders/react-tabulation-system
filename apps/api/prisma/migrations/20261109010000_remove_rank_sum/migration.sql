-- Events are development-only and can be recreated with updated fixtures.
ALTER TABLE "Round" DROP COLUMN "scoreMethod";
DROP TYPE "ScoreMethod";
