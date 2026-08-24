-- RenameColumn
ALTER TABLE "User" RENAME COLUMN "shareLocationWithFriends" TO "shareExactLocationWithFriends";

-- AlterTable
ALTER TABLE "Poke" ADD COLUMN "summarizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingCall_meetingId_key" ON "MeetingCall"("meetingId");
