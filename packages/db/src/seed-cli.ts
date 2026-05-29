import { prisma } from './client.js';
import { seed } from './seed.js';

seed()
  .then(async (r) => {
    process.stdout.write(`${JSON.stringify(r)}\n`);
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    process.stderr.write(`seed failed: ${String(err)}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
