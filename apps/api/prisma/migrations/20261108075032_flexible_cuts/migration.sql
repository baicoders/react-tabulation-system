-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "RoundBasis" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "sourceRoundId" INTEGER NOT NULL,
    "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,

    CONSTRAINT "RoundBasis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundBasis_roundId_sourceRoundId_key" ON "RoundBasis"("roundId", "sourceRoundId");

-- CreateIndex
CREATE INDEX "Adjustment_roundId_candidateId_idx" ON "Adjustment"("roundId", "candidateId");

-- AddForeignKey
ALTER TABLE "RoundBasis" ADD CONSTRAINT "RoundBasis_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundBasis" ADD CONSTRAINT "RoundBasis_sourceRoundId_fkey" FOREIGN KEY ("sourceRoundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
