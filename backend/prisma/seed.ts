/**
 * prisma/seed.ts — точка входу для `prisma db seed` / `npx ts-node prisma/seed.ts`
 * Уся логіка знаходиться у src/seed.ts (під rootDir компілятора).
 */
import { autoSeed } from '../src/seed';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

autoSeed()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
