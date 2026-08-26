-- CreateTable: MiniHome, MiniHomeVisit, MeetingChatMessage, MeetingPost, MeetingPostComment
-- (Applied via `prisma db push` due to migration history drift on Render database)

-- CreateTable
CREATE TABLE "MiniHome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileStatus" TEXT,
    "profileBio" TEXT,
    "profileEmoji" TEXT NOT NULL DEFAULT '🌟',
    "profileTheme" TEXT NOT NULL DEFAULT 'PURPLE',
    "profileMusicTitle" TEXT,
    "profileMusicData" BYTEA,
    "profileMusicMimeType" TEXT,
    "profileMusicUpdatedAt" TIMESTAMP(3),
    "profileUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniHome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniHomeVisit" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniHomeVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingChatMessage" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingPost" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiniHome_userId_key" ON "MiniHome"("userId");
CREATE INDEX "MiniHome_userId_idx" ON "MiniHome"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniHomeVisit_ownerId_visitorId_visitedAt_key" ON "MiniHomeVisit"("ownerId", "visitorId", "visitedAt");
CREATE INDEX "MiniHomeVisit_ownerId_visitedAt_idx" ON "MiniHomeVisit"("ownerId", "visitedAt");
CREATE INDEX "MiniHomeVisit_visitorId_visitedAt_idx" ON "MiniHomeVisit"("visitorId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChatMessage_meetingId_clientMessageId_key" ON "MeetingChatMessage"("meetingId", "clientMessageId");
CREATE INDEX "MeetingChatMessage_meetingId_createdAt_idx" ON "MeetingChatMessage"("meetingId", "createdAt");
CREATE INDEX "MeetingChatMessage_senderId_idx" ON "MeetingChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "MeetingPost_meetingId_createdAt_idx" ON "MeetingPost"("meetingId", "createdAt");
CREATE INDEX "MeetingPost_authorId_idx" ON "MeetingPost"("authorId");

-- CreateIndex
CREATE INDEX "MeetingPostComment_postId_createdAt_idx" ON "MeetingPostComment"("postId", "createdAt");
CREATE INDEX "MeetingPostComment_authorId_idx" ON "MeetingPostComment"("authorId");

-- AddForeignKey
ALTER TABLE "MiniHome" ADD CONSTRAINT "MiniHome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiniHomeVisit" ADD CONSTRAINT "MiniHomeVisit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiniHomeVisit" ADD CONSTRAINT "MiniHomeVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingChatMessage" ADD CONSTRAINT "MeetingChatMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingChatMessage" ADD CONSTRAINT "MeetingChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPost" ADD CONSTRAINT "MeetingPost_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingPost" ADD CONSTRAINT "MeetingPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPostComment" ADD CONSTRAINT "MeetingPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MeetingPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingPostComment" ADD CONSTRAINT "MeetingPostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
