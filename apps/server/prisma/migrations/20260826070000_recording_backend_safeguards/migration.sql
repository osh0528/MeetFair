ALTER TABLE "Meeting"
ADD COLUMN "retentionWarningSentAt" TIMESTAMP(3);

ALTER TABLE "MeetingCall"
ADD COLUMN "recordingDeleteAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RecordingAccessLog" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordingAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordingAccessLog_callId_createdAt_idx" ON "RecordingAccessLog"("callId", "createdAt");
CREATE INDEX "RecordingAccessLog_userId_createdAt_idx" ON "RecordingAccessLog"("userId", "createdAt");
CREATE INDEX "RecordingAccessLog_createdAt_idx" ON "RecordingAccessLog"("createdAt");

ALTER TABLE "RecordingAccessLog"
ADD CONSTRAINT "RecordingAccessLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
