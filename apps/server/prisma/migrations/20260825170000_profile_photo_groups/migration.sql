ALTER TABLE "ProfilePhoto" ADD COLUMN "groupId" TEXT;

CREATE INDEX "ProfilePhoto_ownerId_groupId_createdAt_idx" ON "ProfilePhoto"("ownerId", "groupId", "createdAt");
