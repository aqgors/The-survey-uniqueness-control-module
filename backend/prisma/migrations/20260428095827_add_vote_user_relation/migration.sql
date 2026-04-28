-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
