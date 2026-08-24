CREATE TABLE "ProfilePhoto" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "imageData" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "caption" TEXT,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfilePhoto_ownerId_createdAt_idx" ON "ProfilePhoto"("ownerId", "createdAt");

ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
