ALTER TABLE "User"
ADD COLUMN "profileStatus" TEXT,
ADD COLUMN "profileBio" TEXT,
ADD COLUMN "profileEmoji" TEXT NOT NULL DEFAULT '🌟',
ADD COLUMN "profileTheme" TEXT NOT NULL DEFAULT 'PURPLE',
ADD COLUMN "profileMusicTitle" TEXT,
ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);

CREATE TABLE "ProfileGuestbookEntry" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileGuestbookEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileGuestbookEntry_ownerId_createdAt_idx" ON "ProfileGuestbookEntry"("ownerId", "createdAt");
CREATE INDEX "ProfileGuestbookEntry_authorId_idx" ON "ProfileGuestbookEntry"("authorId");

ALTER TABLE "ProfileGuestbookEntry" ADD CONSTRAINT "ProfileGuestbookEntry_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileGuestbookEntry" ADD CONSTRAINT "ProfileGuestbookEntry_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
