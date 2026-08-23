import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { createNotification } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitMeetingUpdated } from "../realtime/events.js";

export const meetingSocialRouter = Router();
meetingSocialRouter.use(requireAuth);
const idSchema = z.string().uuid();

function userId(request: AuthenticatedRequest) {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function requireParticipant(meetingId: string, currentUserId: string) {
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: currentUserId } },
    include: { meeting: true },
  });
  if (!participant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant.");
  return participant;
}

meetingSocialRouter.get("/activity/friends", async (request: AuthenticatedRequest, response, next) => {
  try {
    const currentUserId = userId(request);
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: currentUserId }, { userBId: currentUserId }] },
    });
    const friendIds = friendships.map((friendship) =>
      friendship.userAId === currentUserId ? friendship.userBId : friendship.userAId);
    if (!friendIds.length) {
      response.json({ success: true, data: { activities: [] } });
      return;
    }
    const meetings = await prisma.meeting.findMany({
      where: {
        visibility: "PUBLIC_FRIENDS",
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        participants: { some: { userId: { in: friendIds } } },
        NOT: { participants: { some: { userId: currentUserId } } },
      },
      include: {
        participants: {
          where: { userId: { in: friendIds } },
          include: { user: { select: { id: true, accountId: true, nickname: true } } },
          take: 1,
        },
        joinRequests: { where: { requesterId: currentUserId }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    response.json({
      success: true,
      data: {
        activities: meetings.flatMap((meeting) => meeting.participants[0] ? [{
          meetingId: meeting.id,
          friend: meeting.participants[0].user,
          createdAt: meeting.createdAt.toISOString(),
          joinRequestStatus: meeting.joinRequests[0]?.status ?? null,
        }] : []),
      },
    });
  } catch (error) { next(error); }
});

meetingSocialRouter.post("/:meetingId/join-requests", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const requesterId = userId(request);
    const permissions = z.object({
      cameraPermissionGranted: z.literal(true),
      microphonePermissionGranted: z.literal(true),
    }).parse(request.body);
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.visibility !== "PUBLIC_FRIENDS") {
      throw new AppError(404, "PUBLIC_MEETING_NOT_FOUND", "Public meeting was not found.");
    }
    if (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "The meeting is closed.");
    }
    const alreadyMember = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: requesterId } },
    });
    if (alreadyMember) throw new AppError(409, "ALREADY_A_PARTICIPANT", "You already joined this meeting.");
    const joinRequest = await prisma.meetingJoinRequest.upsert({
      where: { meetingId_requesterId: { meetingId, requesterId } },
      update: { status: "PENDING", respondedAt: null },
      create: { meetingId, requesterId },
      include: { requester: { select: { nickname: true } } },
    });
    await createNotification({
      userId: meeting.hostId,
      type: "MEETING_JOIN_REQUEST",
      title: "새 모임 참가 신청",
      body: `${joinRequest.requester.nickname}님이 공개 모임 참가를 신청했습니다.`,
      data: { meetingId, joinRequestId: joinRequest.id, ...permissions },
    });
    response.status(201).json({ success: true, data: { joinRequest } });
  } catch (error) { next(error); }
});

meetingSocialRouter.get("/:meetingId/join-requests", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.hostId !== userId(request)) {
      throw new AppError(403, "HOST_ONLY", "Only the host can view join requests.");
    }
    const joinRequests = await prisma.meetingJoinRequest.findMany({
      where: { meetingId },
      include: { requester: { select: { id: true, accountId: true, nickname: true } } },
      orderBy: { createdAt: "desc" },
    });
    response.json({ success: true, data: { joinRequests } });
  } catch (error) { next(error); }
});

meetingSocialRouter.patch("/:meetingId/join-requests/:requestId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const requestId = idSchema.parse(request.params.requestId);
    const { action } = z.object({ action: z.enum(["accept", "reject"]) }).parse(request.body);
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.hostId !== userId(request)) {
      throw new AppError(403, "HOST_ONLY", "Only the host can respond.");
    }
    const joinRequest = await prisma.meetingJoinRequest.findFirst({
      where: { id: requestId, meetingId, status: "PENDING" },
    });
    if (!joinRequest) throw new AppError(404, "JOIN_REQUEST_NOT_FOUND", "Join request was not found.");
    await prisma.$transaction(async (tx) => {
      await tx.meetingJoinRequest.update({
        where: { id: requestId },
        data: { status: action === "accept" ? "ACCEPTED" : "REJECTED", respondedAt: new Date() },
      });
      if (action === "accept") {
        await tx.meetingParticipant.create({
          data: {
            meetingId,
            userId: joinRequest.requesterId,
            cameraPermissionGranted: true,
            microphonePermissionGranted: true,
          },
        });
        await tx.meeting.update({
          where: { id: meetingId },
          data: { voteCountdownEndsAt: null },
        });
      }
    });
    await createNotification({
      userId: joinRequest.requesterId,
      type: "MEETING_JOIN_RESPONDED",
      title: action === "accept" ? "모임 참가 승인" : "모임 참가 거절",
      body: action === "accept" ? "공개 모임 참가가 승인됐습니다." : "공개 모임 참가가 거절됐습니다.",
      data: { meetingId, action },
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "MEMBERS" });
    response.status(204).send();
  } catch (error) { next(error); }
});

meetingSocialRouter.patch("/:meetingId/permissions", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const input = z.object({
      cameraPermissionGranted: z.boolean(),
      microphonePermissionGranted: z.boolean(),
    }).parse(request.body);
    const participant = await requireParticipant(meetingId, userId(request));
    const updated = await prisma.meetingParticipant.update({
      where: { id: participant.id },
      data: input,
    });
    response.json({ success: true, data: { participant: updated } });
  } catch (error) { next(error); }
});

meetingSocialRouter.post("/:meetingId/arrive", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const participant = await requireParticipant(meetingId, userId(request));
    const updated = await prisma.meetingParticipant.update({
      where: { id: participant.id },
      data: { arrivedAt: new Date(), sharingStatus: "ARRIVED", locationConsent: false },
    });
    const remaining = await prisma.meetingParticipant.count({ where: { meetingId, arrivedAt: null } });
    if (remaining === 0) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          locationPurgeAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
    emitMeetingUpdated(meetingId, { meetingId, reason: "ARRIVAL" });
    response.json({ success: true, data: { participant: updated, allArrived: remaining === 0 } });
  } catch (error) { next(error); }
});

meetingSocialRouter.get("/:meetingId/locations", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await requireParticipant(meetingId, userId(request));
    const participants = await prisma.meetingParticipant.findMany({
      where: { meetingId },
      include: { user: { select: { id: true, nickname: true } } },
    });
    response.json({
      success: true,
      data: {
        locations: participants.map((participant) => ({
          userId: participant.userId,
          nickname: participant.user.nickname,
          latitude: participant.lastLatitude,
          longitude: participant.lastLongitude,
          accuracy: participant.lastAccuracy,
          updatedAt: participant.lastLocationAt,
          arrivedAt: participant.arrivedAt,
          sharingStatus: participant.sharingStatus,
        })),
      },
    });
  } catch (error) { next(error); }
});

meetingSocialRouter.post("/:meetingId/candidates", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const currentUserId = userId(request);
    await requireParticipant(meetingId, currentUserId);
    const input = z.object({
      providerPlaceId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120),
      address: z.string().trim().min(1).max(255),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      category: z.string().trim().min(1).max(50),
    }).parse(request.body);
    const candidate = await prisma.placeCandidate.create({
      data: { ...input, meetingId, createdById: currentUserId },
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "VOTES" });
    response.status(201).json({ success: true, data: { candidate } });
  } catch (error) { next(error); }
});
