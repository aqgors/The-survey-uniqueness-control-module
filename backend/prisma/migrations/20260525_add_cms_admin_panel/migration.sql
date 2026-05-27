-- ============================================================================
-- CMS Admin Panel Migration
-- Adds: MODERATOR role, AuditLog, anomaly fields to VoteMeta,
--       updatedAt/duplicatedFromId to surveys, extra user fields
-- ============================================================================

-- 1. Extend Role enum (PostgreSQL requires specific steps)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MODERATOR';

-- 2. Add new columns to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "blockedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "blockedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- 3. Add new columns to surveys
ALTER TABLE "surveys"
  ADD COLUMN IF NOT EXISTS "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "duplicatedFromId" TEXT;

-- Backfill updatedAt = createdAt for existing rows
UPDATE "surveys" SET "updatedAt" = "createdAt" WHERE "updatedAt" = NOW();

-- 4. Add new indexes on surveys
CREATE INDEX IF NOT EXISTS "surveys_isActive_idx" ON "surveys"("isActive");
CREATE INDEX IF NOT EXISTS "surveys_createdAt_idx" ON "surveys"("createdAt");

-- 5. Add anomaly fields to vote_meta
ALTER TABLE "vote_meta"
  ADD COLUMN IF NOT EXISTS "ipSubnet"    TEXT,
  ADD COLUMN IF NOT EXISTS "riskScore"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "flags"       TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Backfill submittedAt from the related vote's createdAt
UPDATE "vote_meta" vm
SET "submittedAt" = v."createdAt"
FROM "votes" v
WHERE vm."voteId" = v."id"
  AND vm."submittedAt" >= NOW() - INTERVAL '1 second';

-- Index riskScore for fast filtering
CREATE INDEX IF NOT EXISTS "vote_meta_riskScore_idx"
  ON "vote_meta"("riskScore");

CREATE INDEX IF NOT EXISTS "index_votemeta_subnet_survey"
  ON "vote_meta"("surveyId", "ipSubnet");

-- 6. Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"         TEXT        NOT NULL,
  "actorId"    TEXT        NOT NULL,
  "action"     TEXT        NOT NULL,
  "targetType" TEXT        NOT NULL,
  "targetId"   TEXT,
  "meta"       JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- FK: actorId → users.id (cascade delete)
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE;

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS "audit_logs_actorId_idx"
  ON "audit_logs"("actorId");

CREATE INDEX IF NOT EXISTS "audit_logs_targetType_targetId_idx"
  ON "audit_logs"("targetType", "targetId");

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"
  ON "audit_logs"("createdAt");
