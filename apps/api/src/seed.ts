import bcrypt from 'bcryptjs';
import { config } from './config';
import { prisma } from './lib/prisma';

// Creates the first admin account if it does not exist yet. Safe to run on every start.
async function main() {
  const existing = await prisma.adminUser.findUnique({ where: { username: config.ADMIN_USERNAME } });
  if (existing) {
    console.log(`Admin "${config.ADMIN_USERNAME}" already exists`);
    return;
  }
  if (!config.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_PASSWORD to create the first admin account');
  }
  await prisma.adminUser.create({
    data: { username: config.ADMIN_USERNAME, passwordHash: await bcrypt.hash(config.ADMIN_PASSWORD, 10) },
  });
  console.log(`Created admin "${config.ADMIN_USERNAME}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
