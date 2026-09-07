ALTER TABLE "MeetingCall"
ADD COLUMN "forcedAt" TIMESTAMP(3);

ALTER TABLE "MeetingCallParticipant"
ADD COLUMN "ringingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "forcedAt" TIMESTAMP(3);

CREATE INDEX "MeetingCall_forcedAt_idx" ON "MeetingCall"("forcedAt");
CREATE INDEX "MeetingCallParticipant_status_ringingAt_idx"
ON "MeetingCallParticipant"("status", "ringingAt");
