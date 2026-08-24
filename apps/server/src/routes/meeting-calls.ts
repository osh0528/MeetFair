import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { endMeetingCallIfInactive } from "../services/meeting-calls.js";

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
          createdAt: participant.call.createdAt.toISOString(),
        })),
      },
    });
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
    const meetingParticipant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: participant.call.meetingId, userId: currentUserId } },
    });
    if (!meetingParticipant?.cameraPermissionGranted || !meetingParticipant.microphonePermissionGranted) {
      throw new AppError(403, "MEDIA_PERMISSIONS_REQUIRED", "Camera and microphone permissions are required.");
    }
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new AppError(503, "LIVEKIT_NOT_CONFIGURED", "LiveKit is not configured.");
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
      canSubscribe: true,
    });
    response.json({
      success: true,
      data: { url: env.LIVEKIT_URL, token: await accessToken.toJwt(), roomName: participant.call.roomName },
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
    const status = action === "accept" ? "JOINED" : action === "decline" ? "DECLINED" : "LEFT";
    await prisma.meetingCallParticipant.update({
      where: { id: participant.id },
      data: {
        status,
        respondedAt: action === "leave" ? undefined : new Date(),
        joinedAt: action === "accept" ? new Date() : undefined,
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
