-- Add fingerprint column to vote_meta (nullable — older rows have no fingerprint)
ALTER TABLE "vote_meta" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;

-- Unique index: one fingerprint per survey (hard-block, survives cookie clearing)
-- NULL values are excluded from unique constraints in PostgreSQL automatically
CREATE UNIQUE INDEX IF NOT EXISTS "unique_survey_fingerprint"
  ON "vote_meta"("surveyId", "fingerprint")
  WHERE "fingerprint" IS NOT NULL;

-- Drop old unique_survey_ip if it exists (IP is now a soft signal, not a unique constraint)
DROP INDEX IF EXISTS "unique_survey_ip";

-- Add soft-signal index for IP analytics (non-unique)
CREATE INDEX IF NOT EXISTS "index_votemeta_ip_survey"
  ON "vote_meta"("surveyId", "ip");
