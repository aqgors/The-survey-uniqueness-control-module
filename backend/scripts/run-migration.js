const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run(label, sql) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    console.warn(`⚠ ${label}: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  console.log('🚀 Running CMS Admin Panel migration...\n');

  await run('MODERATOR role', `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MODERATOR'`);

  await run('users.blockedAt',     `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3)`);
  await run('users.blockedReason', `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT`);
  await run('users.lastLoginAt',   `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3)`);
  await run('users.updatedAt',     `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()`);

  await run('surveys.updatedAt',        `ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()`);
  await run('surveys.duplicatedFromId', `ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "duplicatedFromId" TEXT`);
  await run('surveys.isActive idx',     `CREATE INDEX IF NOT EXISTS "surveys_isActive_idx" ON "surveys"("isActive")`);
  await run('surveys.createdAt idx',    `CREATE INDEX IF NOT EXISTS "surveys_createdAt_idx" ON "surveys"("createdAt")`);

  await run('vote_meta.ipSubnet',    `ALTER TABLE "vote_meta" ADD COLUMN IF NOT EXISTS "ipSubnet" TEXT`);
  await run('vote_meta.riskScore',   `ALTER TABLE "vote_meta" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0`);
  await run('vote_meta.flags',       `ALTER TABLE "vote_meta" ADD COLUMN IF NOT EXISTS "flags" TEXT[] NOT NULL DEFAULT '{}'`);
  await run('vote_meta.submittedAt', `ALTER TABLE "vote_meta" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()`);
  await run('vote_meta.riskScore idx', `CREATE INDEX IF NOT EXISTS "vote_meta_riskScore_idx" ON "vote_meta"("riskScore")`);
  await run('vote_meta.subnet idx',  `CREATE INDEX IF NOT EXISTS "index_votemeta_subnet_survey" ON "vote_meta"("surveyId", "ipSubnet")`);

  await run('backfill submittedAt', `UPDATE "vote_meta" vm SET "submittedAt" = v."createdAt" FROM "votes" v WHERE vm."voteId" = v."id"`);

  await run('create audit_logs', `
    CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id"         TEXT          NOT NULL,
      "actorId"    TEXT          NOT NULL,
      "action"     TEXT          NOT NULL,
      "targetType" TEXT          NOT NULL,
      "targetId"   TEXT,
      "meta"       JSONB,
      "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
    )
  `);

  await run('audit_logs FK', `
    DO $$ BEGIN
      ALTER TABLE "audit_logs"
        ADD CONSTRAINT "audit_logs_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await run('audit_logs actorId idx',   `CREATE INDEX IF NOT EXISTS "audit_logs_actorId_idx" ON "audit_logs"("actorId")`);
  await run('audit_logs target idx',    `CREATE INDEX IF NOT EXISTS "audit_logs_target_idx"  ON "audit_logs"("targetType","targetId")`);
  await run('audit_logs createdAt idx', `CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt")`);

  // Mark migration in _prisma_migrations
  await run('mark migration applied', `
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      'cms_admin_panel_manual',
      NOW(),
      '20260525_add_cms_admin_panel',
      NULL, NULL, NOW(), 1
    )
    ON CONFLICT DO NOTHING
  `);

  console.log('\n✅ Migration complete!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
