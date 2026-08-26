import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitMeetingChatReceived } from "../realtime/events.js";
import { createCallRecordingPlaybackUrl } from "../services/call-recordings.js";

export const meetingChatRouter = Router();
meetingChatRouter.use(requireAuth);

function currentUserId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function requireParticipant(meetingId: string, userId: string) {
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
  return participant;
}

async function recordRecordingAccess(input: {
  meetingId: string;
  callId: string;
  userId: string;
  outcome: "ALLOWED" | "DENIED" | "EXPIRED" | "ERROR";
}) {
  await prisma.recordingAccessLog.create({ data: input }).catch((error) => {
    console.error("Recording access audit failed", error);
  });
}

async function requireRecordingMessage(meetingId: string, messageId: string, userId: string) {
  const message = await prisma.meetingChatMessage.findFirst({
    where: { id: messageId, meetingId, messageType: "VIDEO", deletedAt: null, callId: { not: null } },
    select: { callId: true },
  });
  if (!message?.callId) {
    throw new AppError(404, "RECORDING_NOT_FOUND", "Call recording was not found.");
  }
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
  if (!participant) {
    await recordRecordingAccess({ meetingId, callId: message.callId, userId, outcome: "DENIED" });
    throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
  }
  return message.callId;
}

function toChatMessageSummary(message: {
  id: string;
  meetingId: string;
  senderId: string;
  content: string;
  messageType: string;
  callId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: message.id,
    meetingId: message.meetingId,
    senderId: message.senderId,
    content: message.content,
    messageType: message.messageType === "VIDEO" ? "VIDEO" as const : "TEXT" as const,
    callId: message.callId,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}

// GET /:meetingId/chat/messages
meetingChatRouter.get("/:meetingId/chat/messages", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId } = req.params;
    const { cursor, limit } = z
      .object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).optional() })
      .parse(req.query);

    await requireParticipant(meetingId, userId);

    const take = limit ?? 20;
    let createdAtFilter: Record<string, unknown> | undefined;
    if (cursor) {
      const cursorMessage = await prisma.meetingChatMessage.findUnique({ where: { id: cursor } });
      if (cursorMessage) {
        createdAtFilter = { createdAt: { lt: cursorMessage.createdAt } };
      }
    }

    const messages = await prisma.meetingChatMessage.findMany({
      where: { meetingId, deletedAt: null, ...createdAtFilter },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    });

    const hasMore = messages.length > take;
    const sliced = hasMore ? messages.slice(0, take) : messages;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    res.json({ success: true, data: { messages: sliced.map(toChatMessageSummary), nextCursor } });
  } catch (error) {
    next(error);
  }
});

// GET /:meetingId/chat/messages/:messageId/video
meetingChatRouter.get("/:meetingId/chat/messages/:messageId/video", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId, messageId } = z
      .object({ meetingId: z.string().uuid(), messageId: z.string().uuid() })
      .parse(req.params);
    const callId = await requireRecordingMessage(meetingId, messageId, userId);
    let url: string | null;
    try {
      url = await createCallRecordingPlaybackUrl(callId);
    } catch (error) {
      await recordRecordingAccess({ meetingId, callId, userId, outcome: "ERROR" });
      throw error;
    }
    if (!url) {
      await recordRecordingAccess({ meetingId, callId, userId, outcome: "EXPIRED" });
      throw new AppError(410, "RECORDING_EXPIRED", "Call recording has expired.");
    }
    await recordRecordingAccess({ meetingId, callId, userId, outcome: "ALLOWED" });
    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
});

// GET /:meetingId/chat/messages/:messageId/video/status
meetingChatRouter.get("/:meetingId/chat/messages/:messageId/video/status", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId, messageId } = z
      .object({ meetingId: z.string().uuid(), messageId: z.string().uuid() })
      .parse(req.params);
    const callId = await requireRecordingMessage(meetingId, messageId, userId);
    const call = await prisma.meetingCall.findUnique({
      where: { id: callId },
      select: {
        recordingStatus: true,
        recordingStartedAt: true,
        recordingEndedAt: true,
        recordingExpiresAt: true,
        recordingDeletedAt: true,
        recordingDeleteAttempts: true,
      },
    });
    if (!call) throw new AppError(404, "RECORDING_NOT_FOUND", "Call recording was not found.");
    const available = call.recordingStatus === "STORED"
      && !call.recordingDeletedAt
      && !!call.recordingExpiresAt
      && call.recordingExpiresAt > new Date();
    res.json({
      success: true,
      data: {
        status: call.recordingStatus,
        available,
        startedAt: call.recordingStartedAt?.toISOString() ?? null,
        endedAt: call.recordingEndedAt?.toISOString() ?? null,
        expiresAt: call.recordingExpiresAt?.toISOString() ?? null,
        deletedAt: call.recordingDeletedAt?.toISOString() ?? null,
        deletionRetrying: call.recordingDeleteAttempts > 0 && !call.recordingDeletedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /:meetingId/chat/messages
meetingChatRouter.post("/:meetingId/chat/messages", async (req, res, next) => {
  try {
    const userId = currentUserId(req as AuthenticatedRequest);
    const { meetingId } = req.params;
    const { content, clientMessageId } = z
      .object({
        content: z.string(),
        clientMessageId: z.string().uuid().optional().nullable(),
      })
      .parse(req.body);

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Message content must not be empty.");
    }
    if (trimmed.length > 2000) {
      throw new AppError(400, "VALIDATION_ERROR", "Message content must not exceed 2000 characters.");
    }

    await requireParticipant(meetingId, userId);

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");

    const blockBetween = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: meeting.hostId },
          { blockerId: meeting.hostId, blockedId: userId },
        ],
      },
    });
    if (blockBetween) throw new AppError(403, "BLOCKED", "You cannot send messages in this meeting.");

    if (clientMessageId) {
      const existing = await prisma.meetingChatMessage.findFirst({
        where: { meetingId, clientMessageId },
      });
      if (existing) {
        res.status(201).json({ success: true, data: { message: toChatMessageSummary(existing) } });
        return;
      }
    }

    const result = await prisma.meetingChatMessage.create({
      data: {
        meetingId,
        senderId: userId,
        content: trimmed,
        clientMessageId: clientMessageId ?? undefined,
      },
    });

    emitMeetingChatReceived(meetingId, { message: toChatMessageSummary(result) });

    res.status(201).json({ success: true, data: { message: toChatMessageSummary(result) } });
  } catch (error) {
    next(error);
  }
});
