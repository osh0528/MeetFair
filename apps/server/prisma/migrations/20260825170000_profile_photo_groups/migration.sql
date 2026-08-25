ALTER TABLE "ProfilePhoto" ADD COLUMN "groupId" TEXT;

CREATE INDEX "ProfilePhoto_ownerId_groupId_createdAt_idx" ON "ProfilePhoto"("ownerId", "groupId", "createdAt");

CREATE TABLE "ProfilePhotoLike" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfilePhotoLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfilePhotoLike_photoId_userId_key" ON "ProfilePhotoLike"("photoId", "userId");
CREATE INDEX "ProfilePhotoLike_userId_createdAt_idx" ON "ProfilePhotoLike"("userId", "createdAt");
ALTER TABLE "ProfilePhotoLike" ADD CONSTRAINT "ProfilePhotoLike_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "ProfilePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfilePhotoLike" ADD CONSTRAINT "ProfilePhotoLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
