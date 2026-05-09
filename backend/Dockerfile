FROM node:20-alpine

WORKDIR /app

# openssl — для Prisma binary engine
# postgresql-client — для pg_isready в entrypoint.sh
# dumb-init — правильна обробка SIGTERM (PID 1 problem)
RUN apk add --no-cache openssl postgresql-client dumb-init

# Встановлюємо ВСІ залежності (включно з dev):
# - prisma CLI (devDep) потрібна для `prisma generate` та `prisma db push`
# - typescript (devDep) потрібна для `npm run build`
# Шар кешується Docker, тому перебудова при незмінному package.json миттєва.
COPY package*.json ./
RUN npm ci

# Генеруємо Prisma client (до компіляції TypeScript)
COPY prisma ./prisma
RUN npx prisma generate

# Копіюємо весь source та компілюємо TypeScript → dist/
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Копіюємо entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001

# dumb-init як PID 1 — коректно форвардить SIGTERM до Node.js
ENTRYPOINT ["dumb-init", "--", "/app/entrypoint.sh"]
