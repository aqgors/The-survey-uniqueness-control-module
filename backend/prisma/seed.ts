import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing users
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('123456', 10);

  const users = [
    {
      email: 'test1@mail.com',
      password: passwordHash,
      name: 'User 1',
      role: 'USER' as const,
    },
    {
      email: 'test2@mail.com',
      password: passwordHash,
      name: 'User 2',
      role: 'USER' as const,
    },
    {
      email: 'test3@mail.com',
      password: passwordHash,
      name: 'User 3',
      role: 'USER' as const,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }

  console.log('✅ Seed successful! Created 3 test users.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
