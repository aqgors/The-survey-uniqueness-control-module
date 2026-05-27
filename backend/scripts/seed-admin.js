const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 12);

  // Upsert admin user
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@cms.local' },
    update: { role: 'ADMIN', password, isBlocked: false },
    create: {
      email:    'admin@cms.local',
      name:     'CMS Admin',
      password,
      role:     'ADMIN',
      isBlocked: false,
    },
  });

  // Upsert moderator
  const mod = await prisma.user.upsert({
    where:  { email: 'mod@cms.local' },
    update: { role: 'MODERATOR' },
    create: {
      email:    'mod@cms.local',
      name:     'CMS Moderator',
      password: await bcrypt.hash('mod123456', 12),
      role:     'MODERATOR',
      isBlocked: false,
    },
  });

  console.log('✅ Admin created:', admin.email, '| role:', admin.role);
  console.log('✅ Moderator created:', mod.email, '| role:', mod.role);
  console.log('\nCredentials:');
  console.log('  Admin:     admin@cms.local / admin123');
  console.log('  Moderator: mod@cms.local   / mod123456');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
