import { Router } from "express";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { endMeetingCallIfInactive, summaryFor } from "../services/meeting-calls.js";
import { callRecordingConfigured, ensureCallRecording } from "../services/call-recordings.js";
import { callLeaveLockedUntil, callLeaveLockRemainingMs } from "../services/call-lock.js";

export const meetingCallsRouter = Router();
meetingCallsRouter.use(requireAuth);
const idSchema = z.string().uuid();

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

meetingCallsRouter.get("/pending", async (request: AuthenticatedRequest, response, next) => {
  try {
    const participants = await prisma.meetingCallParticipant.findMany({
      where: {
        userId: userId(request),
        status: { in: ["RINGING", "JOINED"] },
        call: { status: { not: "ENDED" } },
      },
      include: { call: { include: { meeting: { select: { title: true } } } } },
      orderBy: { call: { createdAt: "desc" } },
    });
    response.json({
      success: true,
      data: {
        calls: participants.map((participant) => ({
          id: participant.call.id,
          meetingId: participant.call.meetingId,
          meetingTitle: participant.call.meeting.title,
          roomName: participant.call.roomName,
          status: participant.call.status,
          participantStatus: participant.status,
          forced: participant.forcedAt !== null,
          createdAt: participant.call.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) { next(error); }
});

meetingCallsRouter.post("/meetings/:meetingId/join", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const currentUserId = userId(request);
    const meetingParticipant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: currentUserId } },
      include: { meeting: { select: { id: true, title: true, status: true } } },
    });
    if (!meetingParticipant) {
      throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
    }
    if (meetingParticipant.meeting.status === "COMPLETED" || meetingParticipant.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is no longer available.");
    }

    const call = await prisma.meetingCall.upsert({
      where: { meetingId },
      create: {
        meetingId,
        roomName: `meeting-${meetingId}-${Date.now()}`,
      },
      update: {},
      include: { meeting: { select: { title: true } } },
    });
    if (call.status === "ENDED") {
      throw new AppError(409, "MEETING_CALL_ENDED", "This meeting call has already ended.");
    }

    const existingParticipant = await prisma.meetingCallParticipant.findUnique({
      where: { callId_userId: { callId: call.id, userId: currentUserId } },
    });
    const participant = existingParticipant?.status === "JOINED"
      ? existingParticipant
      : await prisma.meetingCallParticipant.upsert({
          where: { callId_userId: { callId: call.id, userId: currentUserId } },
          create: { callId: call.id, userId: currentUserId, status: "RINGING", ringingAt: new Date() },
          update: { status: "RINGING", ringingAt: new Date(), respondedAt: null, leftAt: null },
        });

    response.json({ success: true, data: summaryFor(call, participant) });
  } catch (error) { next(error); }
});

meetingCallsRouter.post("/:callId/token", async (request: AuthenticatedRequest, response, next) => {
  try {
    const callId = idSchema.parse(request.params.callId);
    const currentUserId = userId(request);
    const participant = await prisma.meetingCallParticipant.findUnique({
      where: { callId_userId: { callId, userId: currentUserId } },
      include: { call: true, user: { select: { nickname: true } } },
    });
    if (!participant || participant.call.status === "ENDED") {
      throw new AppError(404, "MEETING_CALL_NOT_FOUND", "Meeting call was not found.");
    }
    if (participant.status !== "JOINED") {
      throw new AppError(409, "MEETING_CALL_NOT_ACCEPTED", "Accept the meeting call before joining the room.");
    }
    const meetingParticipant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: participant.call.meetingId, userId: currentUserId } },
    });
    if (!meetingParticipant?.cameraPermissionGranted) {
      throw new AppError(403, "CAMERA_PERMISSION_REQUIRED", "Camera permission is required.");
    }
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new AppError(503, "LIVEKIT_NOT_CONFIGURED", "LiveKit is not configured.");
    }
    const joinedAt = participant.joinedAt ?? new Date();
    if (!participant.joinedAt) {
      await prisma.meetingCallParticipant.update({
        where: { id: participant.id },
        data: { joinedAt },
      });
    }
    let recordingEnabled = false;
    if (callRecordingConfigured()) {
      try {
        await ensureCallRecording(callId, participant.call.roomName);
        recordingEnabled = true;
      } catch (error) {
        console.error("Meeting call recording failed to start; continuing without recording", error);
      }
    } else {
      await prisma.meetingCall.updateMany({
        where: { id: callId, recordingStatus: "PENDING" },
        data: {
          recordingStatus: "FAILED",
          recordingError: "Call recording storage is not configured.",
        },
      });
      console.warn("Meeting call is continuing without recording because storage is not configured", { callId });
    }
    const accessToken = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: currentUserId,
      name: participant.user.nickname,
      ttl: "15m",
    });
    accessToken.addGrant({
      room: participant.call.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
      canSubscribe: true,
    });
    response.json({
      success: true,
      data: {
        url: env.LIVEKIT_URL,
        token: await accessToken.toJwt(),
        roomName: participant.call.roomName,
        recordingEnabled,
        leaveLockedUntil: participant.forcedAt ? callLeaveLockedUntil(participant.forcedAt).toISOString() : null,
      },
    });
  } catch (error) { next(error); }
});

meetingCallsRouter.patch("/:callId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const callId = idSchema.parse(request.params.callId);
    const currentUserId = userId(request);
    const { action } = z.object({ action: z.enum(["accept", "decline", "leave"]) }).parse(request.body);
    const participant = await prisma.meetingCallParticipant.findUnique({
      where: { callId_userId: { callId, userId: currentUserId } },
      include: { call: { select: { status: true } } },
    });
    if (!participant || participant.call.status === "ENDED") {
      throw new AppError(404, "MEETING_CALL_NOT_FOUND", "Meeting call was not found.");
    }
    if (action !== "accept" && participant.forcedAt && participant.joinedAt) {
      const remainingMs = callLeaveLockRemainingMs(participant.forcedAt);
      if (remainingMs > 0) {
        throw new AppError(
          409,
          "CALL_MINIMUM_DURATION_NOT_MET",
          `통화 연결 후 5분 동안 종료할 수 없습니다. ${Math.ceil(remainingMs / 1000)}초 남았습니다.`,
        );
      }
    }
    const status = action === "accept" ? "JOINED" : action === "decline" ? "DECLINED" : "LEFT";
    await prisma.meetingCallParticipant.update({
      where: { id: participant.id },
      data: {
        status,
        respondedAt: action === "leave" ? undefined : new Date(),
        joinedAt: participant.joinedAt ?? undefined,
        leftAt: action === "leave" ? new Date() : undefined,
      },
    });
    if (action === "accept") {
      await prisma.meetingCall.update({ where: { id: callId }, data: { status: "ACTIVE" } });
    }
    if (action !== "accept") await endMeetingCallIfInactive(callId);
    response.status(204).send();
  } catch (error) { next(error); }
});
