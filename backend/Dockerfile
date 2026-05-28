# ── Stage 1: install all dependencies + generate Prisma client ────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# openssl — required by Prisma binary engine on Alpine (musl libc)
RUN apk add --no-cache openssl

COPY package*.json ./
# prisma/ must be present before npm ci so prisma generate can locate the schema
COPY prisma ./prisma

RUN npm ci && npx prisma generate

# ── Stage 2: compile TypeScript ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

RUN npm run build

# ── Stage 3: production runtime ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# openssl — Prisma query engine requirement
# dumb-init — proper SIGTERM forwarding (PID 1 problem)
RUN apk add --no-cache openssl dumb-init

COPY package*.json ./
COPY prisma ./prisma

# Install production dependencies only (no Prisma CLI, no TypeScript compiler)
RUN npm ci --omit=dev

# Overwrite with generated Prisma artifacts from the deps stage:
#   .prisma/client/   — native query engine binary (linux-musl-openssl)
#   @prisma/client/   — generated TypeScript client (models, types, runtime)
COPY --from=deps /app/node_modules/.prisma      ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=builder /app/dist ./dist

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--", "node", "dist/server.js"]
