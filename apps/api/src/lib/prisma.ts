import { Prisma, PrismaClient } from '@prisma/client';

// Decimal columns (points, weights) go to the client as plain numbers instead of strings.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON(this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient();
