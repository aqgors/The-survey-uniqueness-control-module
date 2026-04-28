import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('123456', 12);

  const users = [
    { email: 'test1@mail.com', password: passwordHash, name: 'Тест Один',  role: 'USER' as const },
    { email: 'test2@mail.com', password: passwordHash, name: 'Тест Два',   role: 'USER' as const },
    { email: 'test3@mail.com', password: passwordHash, name: 'Тест Три',   role: 'USER' as const },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where:  { email: user.email },
      update: { name: user.name, password: user.password, role: user.role },
      create: user,
    });
    console.log(`  ✔ ${user.email}`);
  }

  console.log('\n✅ Seed complete! Test accounts:');
  console.log('   test1@mail.com / 123456');
  console.log('   test2@mail.com / 123456');
  console.log('   test3@mail.com / 123456');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
