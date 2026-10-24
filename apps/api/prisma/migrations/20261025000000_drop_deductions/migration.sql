-- DropForeignKey
ALTER TABLE "DeductionRule" DROP CONSTRAINT "DeductionRule_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Deduction" DROP CONSTRAINT "Deduction_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "Deduction" DROP CONSTRAINT "Deduction_roundId_fkey";

-- DropForeignKey
ALTER TABLE "Deduction" DROP CONSTRAINT "Deduction_ruleId_fkey";

-- DropTable
DROP TABLE "DeductionRule";

-- DropTable
DROP TABLE "Deduction";

