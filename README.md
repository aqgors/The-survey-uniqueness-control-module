# 🗳️ SurveyUniq — Онлайн-опитування з Anti-Fraud системою

Веб-застосунок для швидких онлайн-опитувань з гарантованою унікальністю голосів. Один користувач — один голос, без реєстрації.

## 🏗️ Стек технологій

| Шар | Технологія |
|-----|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Anti-fraud | FingerprintJS + SHA-256 IP hash |

## 📁 Структура проєкту

```
The-survey-uniqueness-control-module/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # DB schema
│   └── src/
│       ├── modules/
│       │   ├── surveys/
│       │   │   ├── survey.routes.ts  # GET/POST /api/surveys
│       │   │   ├── survey.service.ts # бізнес-логіка
│       │   │   └── vote.routes.ts    # POST /api/surveys/:slug/vote
│       │   └── anti-fraud/
│       │       └── antifraud.service.ts  # перевірка унікальності
│       ├── plugins/
│       │   └── prisma.ts          # Fastify Prisma plugin
│       └── server.ts              # точка входу
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── surveyApi.ts       # axios API client
│       │   └── fingerprint.ts     # FingerprintJS wrapper
│       ├── pages/
│       │   ├── HomePage.tsx
│       │   ├── CreateSurvey/
│       │   ├── TakeSurvey/
│       │   └── Results/
│       └── components/
│           └── Layout.tsx
└── docker-compose.yml             # PostgreSQL
```

## 🚀 Запуск

### 1. База даних (Docker)

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Backend запустить на `http://localhost:3001`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend запустить на `http://localhost:5173`

---

## 🛡️ Як працює Anti-Fraud система

```
Користувач відкриває посилання
       ↓
FingerprintJS збирає browser fingerprint (клієнт)
       ↓
POST /api/surveys/:slug/vote  { fingerprint, answers }
       ↓
Backend: SHA-256(fingerprint) + SHA-256(IP)
       ↓
┌─────────────────────────────────────┐
│   VoterSession таблиця              │
│   UNIQUE(surveyId, fingerprintHash) │
└─────────────────────────────────────┘
       ↓
   Вже існує? → 409 Conflict ("already_voted")
   Ні? → Записати Vote + VoterSession (транзакція)
```

### Рівні захисту

| Рівень | Метод | Жорсткість |
|--------|-------|------------|
| 1 | Browser fingerprint hash | Суворий (hard block) |
| 2 | IP address hash (ліміт 3/IP) | М'який (враховує NAT) |
| 3 | DB unique constraint | Race-condition захист |

## 🌐 API ендпоінти

| Метод | URL | Опис |
|-------|-----|------|
| `GET` | `/api/surveys` | Всі опитування |
| `POST` | `/api/surveys` | Створити опитування |
| `GET` | `/api/surveys/:slug` | Отримати опитування |
| `GET` | `/api/surveys/:slug/results` | Результати |
| `POST` | `/api/surveys/:slug/vote` | Проголосувати |
| `GET` | `/health` | Health check |

## 🗄️ Prisma Studio

```bash
cd backend
npx prisma studio
```

Відкриє GUI для бази даних на `http://localhost:5555`
