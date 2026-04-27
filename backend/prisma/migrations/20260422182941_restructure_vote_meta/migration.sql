/*
  Warnings:

  - You are about to drop the column `order` on the `options` table. All the data in the column will be lost.
  - You are about to drop the column `order` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `surveys` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `surveys` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `surveys` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `surveys` table. All the data in the column will be lost.
  - You are about to drop the column `optionId` on the `votes` table. All the data in the column will be lost.
  - You are about to drop the column `questionId` on the `votes` table. All the data in the column will be lost.
  - You are about to drop the `voter_sessions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "voter_sessions" DROP CONSTRAINT "voter_sessions_surveyId_fkey";

-- DropForeignKey
ALTER TABLE "votes" DROP CONSTRAINT "votes_optionId_fkey";

-- DropForeignKey
ALTER TABLE "votes" DROP CONSTRAINT "votes_questionId_fkey";

-- DropIndex
DROP INDEX "surveys_slug_key";

-- AlterTable
ALTER TABLE "options" DROP COLUMN "order";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "order",
DROP COLUMN "type";

-- AlterTable
ALTER TABLE "surveys" DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "slug",
DROP COLUMN "updatedAt",
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "votes" DROP COLUMN "optionId",
DROP COLUMN "questionId";

-- DropTable
DROP TABLE "voter_sessions";

-- DropEnum
DROP TYPE "QuestionType";

-- CreateTable
CREATE TABLE "vote_items" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "vote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_meta" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" VARCHAR(512) NOT NULL,
    "cookieId" TEXT NOT NULL,

    CONSTRAINT "vote_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vote_items_voteId_idx" ON "vote_items"("voteId");

-- CreateIndex
CREATE UNIQUE INDEX "vote_meta_voteId_key" ON "vote_meta"("voteId");

-- CreateIndex
CREATE INDEX "index_votemeta_ua_survey" ON "vote_meta"("surveyId", "userAgent");

-- CreateIndex
CREATE UNIQUE INDEX "vote_meta_surveyId_ip_key" ON "vote_meta"("surveyId", "ip");

-- CreateIndex
CREATE UNIQUE INDEX "vote_meta_surveyId_cookieId_key" ON "vote_meta"("surveyId", "cookieId");

-- CreateIndex
CREATE INDEX "options_questionId_idx" ON "options"("questionId");

-- CreateIndex
CREATE INDEX "questions_surveyId_idx" ON "questions"("surveyId");

-- CreateIndex
CREATE INDEX "votes_surveyId_idx" ON "votes"("surveyId");

-- AddForeignKey
ALTER TABLE "vote_items" ADD CONSTRAINT "vote_items_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_items" ADD CONSTRAINT "vote_items_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_meta" ADD CONSTRAINT "vote_meta_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
