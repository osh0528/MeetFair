ALTER TABLE "MeetingChatMessage"
ADD COLUMN "messageType" TEXT NOT NULL DEFAULT 'TEXT',
ADD COLUMN "callId" TEXT;

CREATE UNIQUE INDEX "MeetingChatMessage_callId_key" ON "MeetingChatMessage"("callId");

ALTER TABLE "MeetingChatMessage"
ADD CONSTRAINT "MeetingChatMessage_callId_fkey"
FOREIGN KEY ("callId") REFERENCES "MeetingCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
