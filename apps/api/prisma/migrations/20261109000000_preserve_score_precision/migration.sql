-- Keep calculated scores unrounded when a round is closed and later reused.
ALTER TABLE "RoundEntry" ALTER COLUMN "score" TYPE DECIMAL(38, 20);
