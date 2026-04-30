-- AlterTable invite_tokens: drop maxUsages, add expiresAt
ALTER TABLE "invite_tokens" DROP COLUMN IF EXISTS "maxUsages";
ALTER TABLE "invite_tokens" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
