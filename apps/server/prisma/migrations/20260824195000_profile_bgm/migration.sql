ALTER TABLE "User"
ADD COLUMN "profileMusicData" BYTEA,
ADD COLUMN "profileMusicMimeType" TEXT,
ADD COLUMN "profileMusicUpdatedAt" TIMESTAMP(3);
