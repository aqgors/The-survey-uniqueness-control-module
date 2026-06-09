/**
 * prisma/seed.ts
 *
 * Автоматичний seed — запускається при старті сервера якщо БД повністю порожня.
 * Заповнює базу реалістичними тестовими даними:
 *   - 1 адмін, 1 модератор, 5 звичайних користувачів
 *   - 4 опитування різних типів з питаннями і варіантами відповідей
 *   - Голоси + VoteMeta (включно з аномальними записами для демо /admin/anomalies)
 *
 * Перевірка: якщо в таблиці users є хоча б один рядок — seed пропускається.
 */

import { PrismaClient, SurveyAccessType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ago(days: number, hours = 0, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  d.setMinutes(d.getMinutes() - minutes);
  return d;
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip.trim()).digest('hex');
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function autoSeed(
  log: (msg: string) => void = console.log,
  externalPrisma?: PrismaClient,
) {
  const prisma = externalPrisma ?? new PrismaClient();
  // Перевірка: пропускаємо seed якщо БД вже має дані
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    log('🌱 Seed: database already has data, skipping.');
    return;
  }

  log('🌱 Seed: database is empty — populating with demo data...');

  // ── 1. Користувачі ─────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword  = await bcrypt.hash('user1234', 10);

  const admin = await prisma.user.create({ data: {
    email: 'admin@cms.local', name: 'CMS Admin',
    password: adminPassword, role: 'ADMIN',
    createdAt: ago(30), lastLoginAt: ago(0, 2),
  }});

  const moderator = await prisma.user.create({ data: {
    email: 'mod@cms.local', name: 'Олена Мороз',
    password: await bcrypt.hash('mod12345', 10), role: 'MODERATOR',
    createdAt: ago(25), lastLoginAt: ago(1),
  }});

  const users = await Promise.all([
    prisma.user.create({ data: { email: 'ivan@example.com',   name: 'Іван Петренко',   password: userPassword, createdAt: ago(20), lastLoginAt: ago(2) } }),
    prisma.user.create({ data: { email: 'maria@example.com',  name: 'Марія Коваль',    password: userPassword, createdAt: ago(18), lastLoginAt: ago(1) } }),
    prisma.user.create({ data: { email: 'dmytro@example.com', name: 'Дмитро Шевченко', password: userPassword, createdAt: ago(15), lastLoginAt: ago(0, 5) } }),
    prisma.user.create({ data: { email: 'olga@example.com',   name: 'Ольга Бондар',    password: userPassword, createdAt: ago(10), lastLoginAt: ago(3) } }),
    prisma.user.create({ data: { email: 'taras@example.com',  name: 'Тарас Лисенко',   password: userPassword, createdAt: ago(7),  lastLoginAt: ago(0, 1) } }),
  ]);

  log(`  ✅ Created ${2 + users.length} users (admin, moderator, 5 regular)`);

  // ── 2. Опитування ──────────────────────────────────────────────────────────

  // Опитування 1: Улюблена мова програмування (публічне, активне)
  const survey1 = await prisma.survey.create({ data: {
    title: 'Яка ваша улюблена мова програмування?',
    description: 'Опитування для розробників нашої команди. Допоможе вибрати стек для наступного проекту.',
    createdById: admin.id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(14),
    questions: { create: [
      { text: 'Яку мову програмування ви використовуєте найчастіше?', options: { create: [
        { text: 'TypeScript' }, { text: 'Python' }, { text: 'Go' }, { text: 'Rust' }, { text: 'Java' },
      ]}},
      { text: 'Яке середовище виконання ви надаєте перевагу?', options: { create: [
        { text: 'Node.js' }, { text: 'Deno' }, { text: 'Bun' }, { text: 'JVM' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 2: Якість навчання (публічне, дедлайн у майбутньому)
  const survey2 = await prisma.survey.create({ data: {
    title: 'Оцінка якості навчального процесу 2025/2026',
    description: 'Анонімне опитування студентів. Відповіді допоможуть покращити навчальну програму.',
    createdById: moderator.id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdAt: ago(7),
    questions: { create: [
      { text: 'Як ви оцінюєте якість викладання?', options: { create: [
        { text: 'Відмінно' }, { text: 'Добре' }, { text: 'Задовільно' }, { text: 'Незадовільно' },
      ]}},
      { text: 'Чи задоволені ви матеріально-технічною базою?', options: { create: [
        { text: 'Так, повністю' }, { text: 'Частково' }, { text: 'Ні' },
      ]}},
      { text: 'Що варто покращити насамперед?', options: { create: [
        { text: 'Практичні заняття' }, { text: 'Онлайн-ресурси' }, { text: 'Комунікацію з викладачами' }, { text: 'Розклад' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 3: Вибір офісного дня (завершене)
  const survey3 = await prisma.survey.create({ data: {
    title: 'Який день офлайн-зустрічі зручніший?',
    description: 'Допоможіть обрати кращий день для щотижневого офісного дня команди.',
    createdById: users[0].id,
    isActive: false,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(21),
    deadline: ago(7),
    questions: { create: [
      { text: 'Оберіть зручний день тижня', options: { create: [
        { text: 'Понеділок' }, { text: 'Вівторок' }, { text: 'Середа' }, { text: 'Четвер' }, { text: "П'ятниця" },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 4: З аномаліями (для демо /admin/anomalies)
  const survey4 = await prisma.survey.create({ data: {
    title: 'Тест-опитування (демо аномалій)',
    description: 'Штучно створені голоси для демонстрації роботи системи виявлення аномалій.',
    createdById: admin.id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(3),
    questions: { create: [
      { text: 'Ваш вибір?', options: { create: [
        { text: 'Варіант A' }, { text: 'Варіант B' }, { text: 'Варіант C' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 5: Корпоративна вечірка (завершене, багато голосів)
  const survey5 = await prisma.survey.create({ data: {
    title: 'Де провести корпоратив 2025?',
    description: 'Проголосуйте за місце для нашої річної корпоративної вечірки!',
    createdById: moderator.id,
    isActive: false,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(45),
    deadline: ago(30),
    questions: { create: [
      { text: 'Оберіть формат заходу', options: { create: [
        { text: 'Ресторан у місті' }, { text: 'Виїзд на природу' }, { text: 'Боулінг / квест' }, { text: 'Онлайн-захід' },
      ]}},
      { text: 'Скільки ви готові витратити на квиток?', options: { create: [
        { text: 'До 500 грн' }, { text: '500–1000 грн' }, { text: '1000–2000 грн' }, { text: 'Не має значення' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 6: Задоволеність продуктом (активне, нещодавнє)
  const survey6 = await prisma.survey.create({ data: {
    title: 'Оцінка задоволеності продуктом — Q2 2025',
    description: 'Короткий NPS-опит для внутрішнього трекінгу якості.',
    createdById: admin.id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(5),
    questions: { create: [
      { text: 'Наскільки ймовірно, що ви порекомендуєте наш продукт другу?', options: { create: [
        { text: '9–10 (Промоутер)' }, { text: '7–8 (Нейтральний)' }, { text: '0–6 (Критик)' },
      ]}},
      { text: 'Що вам подобається найбільше?', options: { create: [
        { text: 'Швидкість роботи' }, { text: 'Зручний інтерфейс' }, { text: 'Функціональність' }, { text: 'Ціна' },
      ]}},
      { text: 'Яка функція вам потрібна найбільше?', options: { create: [
        { text: 'Мобільний застосунок' }, { text: 'API-інтеграції' }, { text: 'Аналітика' }, { text: 'Командна робота' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 7: Вибір нової назви проекту (активне)
  const survey7 = await prisma.survey.create({ data: {
    title: 'Голосування за нову назву проекту',
    description: 'Команда пропонує декілька варіантів нової назви — ваш голос вирішить!',
    createdById: users[1].id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(2),
    questions: { create: [
      { text: 'Який варіант назви вам найбільше подобається?', options: { create: [
        { text: 'SurveyPulse' }, { text: 'VoteFlow' }, { text: 'PollGuard' }, { text: 'UniVote' }, { text: 'TrustPoll' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 8: Харчування в офісі (завершене)
  const survey8 = await prisma.survey.create({ data: {
    title: 'Яке харчування ви б хотіли в офісі?',
    description: 'Допоможіть нам облаштувати зону відпочинку та харчування для команди.',
    createdById: users[2].id,
    isActive: false,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(60),
    deadline: ago(45),
    questions: { create: [
      { text: 'Що з їжі ви б хотіли бачити в офісі?', options: { create: [
        { text: 'Фрукти та снеки' }, { text: 'Повноцінні обіди' }, { text: 'Сандвічі та кава' }, { text: 'Нічого, я їм вдома' },
      ]}},
      { text: 'Як часто ви обідаєте в офісі?', options: { create: [
        { text: 'Щодня' }, { text: '3–4 рази на тиждень' }, { text: '1–2 рази на тиждень' }, { text: 'Рідко / ніколи' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 9: Технічний стек фронтенду (активне)
  const survey9 = await prisma.survey.create({ data: {
    title: 'Який UI-фреймворк обрати для нового проекту?',
    description: 'Технічне опитування для фронтенд-команди. Результати вплинуть на вибір стеку.',
    createdById: users[3].id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(4),
    questions: { create: [
      { text: 'Ваш основний UI-фреймворк?', options: { create: [
        { text: 'React' }, { text: 'Vue 3' }, { text: 'Angular' }, { text: 'Svelte' }, { text: 'Solid.js' },
      ]}},
      { text: 'Яку CSS-методологію ви надаєте перевагу?', options: { create: [
        { text: 'Tailwind CSS' }, { text: 'CSS Modules' }, { text: 'Styled Components' }, { text: 'Vanilla CSS' },
      ]}},
      { text: 'Який менеджер стану обираєте?', options: { create: [
        { text: 'Redux Toolkit' }, { text: 'Zustand' }, { text: 'Pinia' }, { text: 'Context API' }, { text: 'Jotai' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  // Опитування 10: Психологічний клімат (активне, з дедлайном)
  const survey10 = await prisma.survey.create({ data: {
    title: 'Анкета психологічного клімату в команді',
    description: 'Анонімне опитування для HR-відділу. Допоможе виявити проблемні зони та покращити добробут команди.',
    createdById: moderator.id,
    isActive: true,
    accessType: SurveyAccessType.PUBLIC,
    createdAt: ago(1),
    deadline: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    questions: { create: [
      { text: 'Як ви оцінюєте свій рівень стресу на роботі?', options: { create: [
        { text: 'Низький — все спокійно' }, { text: 'Середній — справляюсь' }, { text: 'Високий — важко' }, { text: 'Критичний — вигораю' },
      ]}},
      { text: 'Чи відчуваєте ви підтримку від керівництва?', options: { create: [
        { text: 'Так, завжди' }, { text: 'Переважно так' }, { text: 'Рідко' }, { text: 'Ні' },
      ]}},
      { text: 'Що найбільше впливає на ваш настрій на роботі?', options: { create: [
        { text: 'Дедлайни та навантаження' }, { text: 'Стосунки в команді' }, { text: 'Технічні проблеми' }, { text: 'Нечіткі завдання' },
      ]}},
    ]},
  }, include: { questions: { include: { options: true } } }});

  log(`  ✅ Created 10 surveys`);

  // ── 3. Нормальні голоси для survey1 ────────────────────────────────────────

  const s1q1opts = survey1.questions[0].options;
  const s1q2opts = survey1.questions[1].options;

  const normalVoters = [
    { user: users[0], ip: '195.56.120.10', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', delayMs: 45_000 },
    { user: users[1], ip: '195.56.120.11', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) Safari/605.1.15', delayMs: 62_000 },
    { user: users[2], ip: '93.175.22.5',   ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', delayMs: 30_000 },
    { user: users[3], ip: '91.200.14.88',  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15', delayMs: 55_000 },
    { user: users[4], ip: '77.88.55.9',    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/124.0', delayMs: 90_000 },
  ];

  for (let i = 0; i < normalVoters.length; i++) {
    const { user, ip, ua, delayMs } = normalVoters[i];
    const submitTime = ago(i + 1, 0, i * 17);
    const openTime   = new Date(submitTime.getTime() - delayMs);

    const vote = await prisma.vote.create({ data: {
      surveyId: survey1.id,
      voterUserId: user.id,
      createdAt: openTime,
      items: { create: [
        { optionId: s1q1opts[i % s1q1opts.length].id },
        { optionId: s1q2opts[i % s1q2opts.length].id },
      ]},
    }});

    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey1.id,
      ip: hashIp(ip), userAgent: ua,
      cookieId: randomUUID(),
      ipSubnet: ip.split('.').slice(0, 3).join('.') + '.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }

  log(`  ✅ Created ${normalVoters.length} normal votes for survey1`);

  // ── 4. Шкільні голоси для survey2 (та сама підмережа — НОРМАЛЬНО!) ─────────
  // Демонструє що нові аномалії НЕ карають школярів

  const s2opts = survey2.questions.map(q => q.options);

  for (let i = 0; i < 15; i++) {
    const ip = `192.168.1.${i + 10}`;          // різні IP але одна /24 — нормально
    const submitTime = ago(2, 0, i * 3);
    const openTime   = new Date(submitTime.getTime() - (25_000 + i * 1500)); // 25–47 сек

    const vote = await prisma.vote.create({ data: {
      surveyId: survey2.id,
      createdAt: openTime,
      items: { create: [
        { optionId: s2opts[0][i % s2opts[0].length].id },
        { optionId: s2opts[1][i % s2opts[1].length].id },
        { optionId: s2opts[2][i % s2opts[2].length].id },
      ]},
    }});

    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey2.id,
      ip: hashIp(ip),
      userAgent: `Mozilla/5.0 (Windows NT 10.0) Chrome/124.0.${6100 + i} Safari/537.36`,
      cookieId: randomUUID(), ipSubnet: '192.168.1.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }

  log(`  ✅ Created 15 school-like votes for survey2 (same subnet, riskScore=0)`);

  // ── 5. Голоси для завершеного survey3 ─────────────────────────────────────

  const s3opts = survey3.questions[0].options;

  for (let i = 0; i < 8; i++) {
    const ip = `10.0.${Math.floor(i / 3)}.${i + 1}`;
    const submitTime = ago(10 + i, 0, i * 11);
    const openTime   = new Date(submitTime.getTime() - (30_000 + i * 5000));

    const vote = await prisma.vote.create({ data: {
      surveyId: survey3.id,
      voterUserId: i < users.length ? users[i].id : undefined,
      createdAt: openTime,
      items: { create: [{ optionId: s3opts[i % s3opts.length].id }] },
    }});

    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey3.id,
      ip: hashIp(ip),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36',
      cookieId: randomUUID(),
      ipSubnet: ip.split('.').slice(0, 3).join('.') + '.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }

  log(`  ✅ Created 8 votes for survey3 (closed survey)`);

  // ── 5a. Голоси для survey5 (корпоратив — завершене) ──────────────────────

  const s5opts = survey5.questions.map(q => q.options);
  const corpIps = ['194.44.10.1','194.44.10.2','194.44.10.3','178.21.8.5','93.75.12.9','91.200.3.4','46.219.80.1','31.28.160.12','212.90.3.7','77.222.100.8'];

  for (let i = 0; i < 10; i++) {
    const submitTime = ago(35 + i, 0, i * 13);
    const openTime   = new Date(submitTime.getTime() - (40_000 + i * 3000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey5.id,
      voterUserId: i < users.length ? users[i % users.length].id : undefined,
      createdAt: openTime,
      items: { create: [
        { optionId: s5opts[0][i % s5opts[0].length].id },
        { optionId: s5opts[1][i % s5opts[1].length].id },
      ]},
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey5.id,
      ip: hashIp(corpIps[i]), userAgent: `Mozilla/5.0 (Windows NT 10.0) Chrome/122.0.${6000 + i} Safari/537.36`,
      cookieId: randomUUID(), ipSubnet: corpIps[i].split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 10 votes for survey5 (corp party)`);

  // ── 5b. Голоси для survey6 (NPS — активне) ────────────────────────────────

  const s6opts = survey6.questions.map(q => q.options);
  const npsIps = ['5.58.80.1','5.58.80.2','46.133.10.3','176.111.90.4','91.192.50.5','195.136.40.6'];

  for (let i = 0; i < 6; i++) {
    const submitTime = ago(4, i, i * 20);
    const openTime   = new Date(submitTime.getTime() - (35_000 + i * 5000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey6.id,
      voterUserId: users[i % users.length].id,
      createdAt: openTime,
      items: { create: [
        { optionId: s6opts[0][i % s6opts[0].length].id },
        { optionId: s6opts[1][i % s6opts[1].length].id },
        { optionId: s6opts[2][i % s6opts[2].length].id },
      ]},
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey6.id,
      ip: hashIp(npsIps[i]), userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_${i}) AppleWebKit/605.1.15`,
      cookieId: randomUUID(), ipSubnet: npsIps[i].split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 6 votes for survey6 (NPS)`);

  // ── 5c. Голоси для survey7 (назва проекту — активне) ─────────────────────

  const s7opts = survey7.questions[0].options;

  for (let i = 0; i < 4; i++) {
    const ip = `88.200.${i + 1}.${i * 3 + 10}`;
    const submitTime = ago(1, i + 1, i * 25);
    const openTime   = new Date(submitTime.getTime() - (28_000 + i * 4000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey7.id,
      voterUserId: users[i].id,
      createdAt: openTime,
      items: { create: [{ optionId: s7opts[i % s7opts.length].id }] },
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey7.id,
      ip: hashIp(ip), userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
      cookieId: randomUUID(), ipSubnet: ip.split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 4 votes for survey7 (name vote)`);

  // ── 5d. Голоси для survey8 (харчування — завершене) ───────────────────────

  const s8opts = survey8.questions.map(q => q.options);

  for (let i = 0; i < 7; i++) {
    const ip = `172.16.${Math.floor(i/3)}.${i + 5}`;
    const submitTime = ago(50 + i, 0, i * 9);
    const openTime   = new Date(submitTime.getTime() - (50_000 + i * 2000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey8.id,
      voterUserId: i < users.length ? users[i].id : undefined,
      createdAt: openTime,
      items: { create: [
        { optionId: s8opts[0][i % s8opts[0].length].id },
        { optionId: s8opts[1][i % s8opts[1].length].id },
      ]},
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey8.id,
      ip: hashIp(ip), userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.${5900+i} Safari/537.36`,
      cookieId: randomUUID(), ipSubnet: ip.split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 7 votes for survey8 (office food)`);

  // ── 5e. Голоси для survey9 (фронтенд стек — активне) ────────────────────

  const s9opts = survey9.questions.map(q => q.options);

  for (let i = 0; i < 5; i++) {
    const ip = `185.65.${i + 1}.${i * 7 + 20}`;
    const submitTime = ago(3, i, i * 30);
    const openTime   = new Date(submitTime.getTime() - (45_000 + i * 6000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey9.id,
      voterUserId: users[i].id,
      createdAt: openTime,
      items: { create: [
        { optionId: s9opts[0][i % s9opts[0].length].id },
        { optionId: s9opts[1][i % s9opts[1].length].id },
        { optionId: s9opts[2][i % s9opts[2].length].id },
      ]},
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey9.id,
      ip: hashIp(ip), userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/124.0.${6200+i}`,
      cookieId: randomUUID(), ipSubnet: ip.split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 5 votes for survey9 (frontend stack)`);

  // ── 5f. Голоси для survey10 (HR-клімат — активне) ────────────────────────

  const s10opts = survey10.questions.map(q => q.options);

  for (let i = 0; i < 6; i++) {
    const ip = `91.90.${i + 1}.${i * 5 + 100}`;
    const submitTime = ago(0, i + 1, i * 15);
    const openTime   = new Date(submitTime.getTime() - (60_000 + i * 4000));
    const vote = await prisma.vote.create({ data: {
      surveyId: survey10.id,
      voterUserId: users[i % users.length].id,
      createdAt: openTime,
      items: { create: [
        { optionId: s10opts[0][i % s10opts[0].length].id },
        { optionId: s10opts[1][i % s10opts[1].length].id },
        { optionId: s10opts[2][i % s10opts[2].length].id },
      ]},
    }});
    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey10.id,
      ip: hashIp(ip), userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_${i} like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1`,
      cookieId: randomUUID(), ipSubnet: ip.split('.').slice(0,3).join('.')+'.0/24',
      submittedAt: submitTime, riskScore: 0, flags: [],
    }});
  }
  log(`  ✅ Created 6 votes for survey10 (HR climate)`);

  // ── 6. Аномальні голоси для survey4 ───────────────────────────────────────

  // Прапори і бали вже проставлені — щоб /admin/anomalies відразу показував дані

  const s4opts = survey4.questions[0].options;

  type AnomalyEntry = { flags: string[]; riskScore: number; ip: string; ua: string; delaySec: number };

  const anomalyVotes: AnomalyEntry[] = [
    // BOT_SPEED
    { flags: ['BOT_SPEED'], riskScore: 50, ip: '185.220.101.5', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36',         delaySec: 2 },
    { flags: ['BOT_SPEED'], riskScore: 50, ip: '185.220.101.6', ua: 'Mozilla/5.0 (Linux; Android 13) Chrome/124.0 Mobile Safari/537.36', delaySec: 3 },

    // SUSPICIOUS_BROWSER
    { flags: ['SUSPICIOUS_BROWSER'], riskScore: 80, ip: '45.33.32.156', ua: 'python-requests/2.31.0',   delaySec: 1 },
    { flags: ['SUSPICIOUS_BROWSER'], riskScore: 80, ip: '45.33.32.157', ua: 'curl/8.5.0',               delaySec: 0 },
    { flags: ['SUSPICIOUS_BROWSER'], riskScore: 80, ip: '45.33.32.158', ua: 'axios/1.6.8 node-fetch',   delaySec: 1 },

    // BOT_SPEED + SUSPICIOUS_BROWSER — максимальний ризик
    { flags: ['BOT_SPEED', 'SUSPICIOUS_BROWSER'], riskScore: 100, ip: '104.21.50.3', ua: 'playwright/1.44.0 headless', delaySec: 0 },
    { flags: ['BOT_SPEED', 'SUSPICIOUS_BROWSER'], riskScore: 100, ip: '104.21.50.4', ua: 'puppeteer/22.8.2',           delaySec: 1 },

    // SYNCHRONIZED_BURST — три голоси з однієї IP в межах 1 секунди
    { flags: ['SYNCHRONIZED_BURST'], riskScore: 60, ip: '77.32.100.200', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', delaySec: 8 },
    { flags: ['SYNCHRONIZED_BURST'], riskScore: 60, ip: '77.32.100.200', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', delaySec: 8 },
    { flags: ['SYNCHRONIZED_BURST'], riskScore: 60, ip: '77.32.100.200', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', delaySec: 8 },

    // Чисті голоси для контрасту
    { flags: [], riskScore: 0, ip: '203.0.113.1', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15',                        delaySec: 40 },
    { flags: [], riskScore: 0, ip: '203.0.113.2', ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',       delaySec: 55 },
  ];

  // Базовий момент для SYNCHRONIZED_BURST — одна й та сама секунда
  const burstBase = ago(1, 2, 0);

  for (let i = 0; i < anomalyVotes.length; i++) {
    const av = anomalyVotes[i];
    const isBurst = av.flags.includes('SYNCHRONIZED_BURST');

    const submitTime = isBurst
      ? new Date(burstBase.getTime() + i * 50)         // ±50 мс — менше секунди
      : ago(Math.floor(i / 3), i % 3, i * 5 + 10);

    const openTime = new Date(submitTime.getTime() - av.delaySec * 1000);

    const vote = await prisma.vote.create({ data: {
      surveyId: survey4.id,
      createdAt: openTime,
      items: { create: [{ optionId: s4opts[i % s4opts.length].id }] },
    }});

    await prisma.voteMeta.create({ data: {
      voteId: vote.id, surveyId: survey4.id,
      ip: hashIp(av.ip), userAgent: av.ua,
      cookieId: randomUUID(),
      ipSubnet: av.ip.split('.').slice(0, 3).join('.') + '.0/24',
      submittedAt: submitTime,
      riskScore: av.riskScore,
      flags: av.flags,
    }});
  }

  log(`  ✅ Created ${anomalyVotes.length} anomaly demo votes for survey4`);

  // ── 7. AuditLog ────────────────────────────────────────────────────────────

  await prisma.auditLog.createMany({ data: [
    { actorId: admin.id,     action: 'SURVEY_CREATED',  targetType: 'SURVEY',    targetId: survey1.id, createdAt: ago(14) },
    { actorId: admin.id,     action: 'SURVEY_CREATED',  targetType: 'SURVEY',    targetId: survey4.id, createdAt: ago(3)  },
    { actorId: admin.id,     action: 'ANOMALY_FLAGGED', targetType: 'VOTE_META', meta: { flag: 'MANUAL_FLAG' }, createdAt: ago(1) },
    { actorId: moderator.id, action: 'SURVEY_CREATED',  targetType: 'SURVEY',    targetId: survey2.id, createdAt: ago(7)  },
    { actorId: moderator.id, action: 'USER_BLOCKED',    targetType: 'USER',      meta: { reason: 'spam' }, createdAt: ago(5) },
  ]});

  log(`  ✅ Created audit log entries`);

  log('');
  log('🎉 Seed complete! Demo credentials:');
  log('   Admin:     admin@cms.local   / admin123');
  log('   Moderator: mod@cms.local     / mod12345');
  log('   Users:     ivan@example.com  / user1234  (та інші)');
}

// ── Якщо запускається напряму: npx ts-node prisma/seed.ts ────────────────────
if (require.main === module) {
  const standaloneClient = new PrismaClient();
  autoSeed(console.log, standaloneClient)
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => standaloneClient.$disconnect());
}
