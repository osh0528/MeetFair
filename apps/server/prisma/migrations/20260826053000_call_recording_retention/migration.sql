ALTER TABLE "MeetingCall"
ADD COLUMN "recordingStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "recordingEgressId" TEXT,
ADD COLUMN "recordingObjectKey" TEXT,
ADD COLUMN "recordingStartedAt" TIMESTAMP(3),
ADD COLUMN "recordingEndedAt" TIMESTAMP(3),
ADD COLUMN "recordingExpiresAt" TIMESTAMP(3),
ADD COLUMN "recordingDeletedAt" TIMESTAMP(3),
ADD COLUMN "recordingError" TEXT;

CREATE INDEX "MeetingCall_recordingStatus_recordingExpiresAt_idx"
ON "MeetingCall"("recordingStatus", "recordingExpiresAt");
