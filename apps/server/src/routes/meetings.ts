import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import {
  toMeetingInvitationSummary,
  toMeetingMemberStatusEntry,
} from "../lib/serializers.js";
import { accountIdSchema } from "../lib/users.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  emitMeetingInvitationReceived,
  emitMeetingInvitationResponded,
  emitMeetingUpdated,
  emitPoke,
} from "../realtime/events.js";
import { createNotification } from "../lib/notifications.js";
import { evaluateMeetingVote } from "../services/meetings.js";
import { generateRecommendations } from "../services/recommendations.js";
import { canInviteToMeeting } from "../services/invitation-policy.js";

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);
recommendationsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { meetingId } = z.object({ meetingId: idSchema }).parse(request.query);
    await participantFor(meetingId, userId(request));
    const recommendations = await generateRecommendations(meetingId, userId(request));
    response.json({ success: true, data: { recommendations } });
  } catch (error) { next(error); }
});

const idSchema = z.string().uuid();
const meetingInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  scheduledAt: z.coerce.date().refine((date) => date > new Date(), "scheduledAt must be in the future"),
  inviteeUserIds: z.array(idSchema).max(50).optional(),
  inviteeAccountIds: z.array(accountIdSchema).max(50).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC_FRIENDS"]).default("PRIVATE"),
  categories: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  travelMetric: z.enum(["TRANSIT", "CAR", "DISTANCE"]).default("DISTANCE"),
  locationShareMode: z.enum(["DAY_OF", "BEFORE_START", "OFF"]).default("BEFORE_START"),
  shareMinutesBefore: z.number().int().min(1).max(1440).nullable().optional(),
  originType: z.enum(["HOME", "CUSTOM"]).default("HOME"),
  customOriginAddress: z.string().trim().min(1).max(255).optional(),
  customOriginLatitude: z.number().min(-90).max(90).optional(),
  customOriginLongitude: z.number().min(-180).max(180).optional(),
}).superRefine((input, context) => {
  if (input.locationShareMode === "BEFORE_START" && input.shareMinutesBefore == null) {
    context.addIssue({ code: "custom", path: ["shareMinutesBefore"], message: "shareMinutesBefore is required." });
  }
  if (input.originType === "CUSTOM" && (input.customOriginAddress == null || input.customOriginLatitude == null || input.customOriginLongitude == null)) {
    context.addIssue({ code: "custom", path: ["customOriginAddress"], message: "custom origin fields are required when originType is CUSTOM." });
  }
});
const originSchema = z.object({
  originType: z.enum(["HOME", "CURRENT", "CUSTOM"]).default("CUSTOM"),
  address: z.string().trim().min(1).max(255),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const additionalInviteesSchema = z.object({
  inviteeUserIds: z.array(idSchema).min(1).max(50),
});
const meetingUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  scheduledAt: z.coerce.date().optional(),
}).refine((input) => input.title !== undefined || input.scheduledAt !== undefined, "At least one meeting field is required.");

function userId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function participantFor(meetingId: string, currentUserId: string) {
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: currentUserId } },
    include: {
      meeting: true,
      user: { select: { id: true, accountId: true, nickname: true } },
    },
  });
  if (!participant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
  return participant;
}

async function hostFor(meetingId: string, currentUserId: string) {
  const participant = await participantFor(meetingId, currentUserId);
  if (participant.meeting.hostId !== currentUserId) {
    throw new AppError(403, "HOST_ONLY", "Only the meeting host can perform this action.");
  }
  return participant;
}

function createInviteCode() {
  return randomBytes(5).toString("base64url").toUpperCase();
}

function recommendationSummary(candidate: {
  id: string; name: string; address: string; latitude: number; longitude: number; category: string;
  travelEstimates: { userId: string; durationMinutes: number; distanceMeters: number; user: { id: string; accountId: string; nickname: string } }[];
}) {
  const times = candidate.travelEstimates.map((estimate) => estimate.durationMinutes);
  const averageDurationMinutes = times.length ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : 0;
  const maximumDurationMinutes = times.length ? Math.max(...times) : 0;
  const timeGapMinutes = times.length ? Math.max(...times) - Math.min(...times) : 0;
  return {
    id: candidate.id, name: candidate.name, address: candidate.address, latitude: candidate.latitude,
    longitude: candidate.longitude, category: candidate.category, averageDurationMinutes,
    maximumDurationMinutes, timeGapMinutes,
    participantTravelTimes: candidate.travelEstimates.map((estimate) => ({
      userId: estimate.userId, nickname: estimate.user.nickname, durationMinutes: estimate.durationMinutes,
      distanceMeters: estimate.distanceMeters,
    })),
  };
}

async function resolveInvitees(input: {
  inviteeUserIds?: string[];
  inviteeAccountIds?: string[];
  hostId: string;
}) {
  const uniqueUserIds = [...new Set(input.inviteeUserIds ?? [])];
  const uniqueAccountIds = [...new Set(input.inviteeAccountIds ?? [])];

  const accountUsers = uniqueAccountIds.length
    ? await prisma.user.findMany({
        where: { accountId: { in: uniqueAccountIds } },
        select: { id: true, accountId: true, nickname: true },
      })
    : [];
  if (accountUsers.length !== uniqueAccountIds.length) {
    throw new AppError(404, "USER_NOT_FOUND", "One or more account IDs were not found.");
  }

  const directUsers = uniqueUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: { id: true, accountId: true, nickname: true },
      })
    : [];
  if (directUsers.length !== uniqueUserIds.length) {
    throw new AppError(404, "USER_NOT_FOUND", "One or more user IDs were not found.");
  }

  const inviteesById = new Map<string, { id: string; accountId: string; nickname: string }>();
  for (const user of [...accountUsers, ...directUsers]) {
    inviteesById.set(user.id, user);
  }

  if (inviteesById.has(input.hostId)) {
    throw new AppError(400, "CANNOT_INVITE_SELF", "You cannot invite yourself.");
  }

  return [...inviteesById.values()];
}

meetingsRouter.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = meetingInputSchema.parse(request.body);
    const hostId = userId(request);
    const invitees = await resolveInvitees({
      inviteeUserIds: input.inviteeUserIds,
      inviteeAccountIds: input.inviteeAccountIds,
      hostId,
    });
    if (invitees.length) {
      const friendCount = await prisma.friendship.count({
        where: {
          OR: invitees.map((invitee) => hostId < invitee.id
            ? { userAId: hostId, userBId: invitee.id }
            : { userAId: invitee.id, userBId: hostId }),
        },
      });
      if (friendCount !== invitees.length) {
        throw new AppError(403, "INVITEES_MUST_BE_FRIENDS", "Only accepted friends can be invited.");
      }
    }

    let meeting;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        meeting = await prisma.$transaction(async (tx) => {
          const created = await tx.meeting.create({
            data: {
              title: input.title,
              scheduledAt: input.scheduledAt,
              hostId,
              inviteCode: createInviteCode(),
              visibility: input.visibility,
              categories: input.categories,
              travelMetric: input.travelMetric,
              locationShareMode: input.locationShareMode,
              shareMinutesBefore: input.locationShareMode === "BEFORE_START"
                ? (input.shareMinutesBefore ?? 60)
                : null,
              participants: {
                create: {
                  userId: hostId,
                  cameraPermissionGranted: true,
                  microphonePermissionGranted: true,
                  originType: input.originType === "CUSTOM" ? "CUSTOM" : "HOME",
                  originAddress: input.originType === "CUSTOM" ? input.customOriginAddress ?? null : null,
                  originLatitude: input.originType === "CUSTOM" ? input.customOriginLatitude ?? null : null,
                  originLongitude: input.originType === "CUSTOM" ? input.customOriginLongitude ?? null : null,
                },
              },
            },
          });

          if (invitees.length) {
            await tx.meetingInvitation.createMany({
              data: invitees.map((invitee) => ({
                meetingId: created.id,
                invitedUserId: invitee.id,
                invitedById: hostId,
              })),
            });
          }

          return created;
        });
        break;
      } catch (error) {
        if (attempt < 2 && isUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    if (!meeting) throw new AppError(500, "MEETING_CREATE_FAILED", "Meeting creation failed.");

    if (invitees.length) {
      const invitations = await prisma.meetingInvitation.findMany({
        where: { meetingId: meeting.id },
        include: {
          meeting: { select: { title: true, scheduledAt: true } },
          invitedBy: { select: { id: true, accountId: true, nickname: true } },
          invitedUser: { select: { id: true, accountId: true, nickname: true } },
        },
      });
      for (const invitation of invitations) {
        await createNotification({
          userId: invitation.invitedUserId,
          type: "MEETING_INVITATION",
          title: "모임 초대가 도착했어요",
          body: `${invitation.invitedBy.nickname}님이 "${invitation.meeting.title}" 모임에 초대했습니다.`,
          data: { invitationId: invitation.id, meetingId: invitation.meetingId },
        });
        emitMeetingInvitationReceived(invitation.invitedUserId, {
          invitation: toMeetingInvitationSummary(invitation),
        });
      }
    }

    response.status(201).json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: { participants: { some: { userId: userId(request) } } },
      include: { host: { select: { id: true, accountId: true, nickname: true } }, confirmedPlace: true, _count: { select: { participants: true } } },
      orderBy: { scheduledAt: "asc" },
    });
    response.json({ success: true, data: meetings });
  } catch (error) { next(error); }
});

meetingsRouter.post("/join", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { inviteCode } = z.object({ inviteCode: z.string().trim().min(4).max(32).transform((value) => value.toUpperCase()) }).parse(request.body);
    const meeting = await prisma.meeting.findUnique({ where: { inviteCode } });
    if (!meeting) throw new AppError(404, "INVALID_INVITE_CODE", "Invite code was not found.");
    if (meeting.status === "COMPLETED" || meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is no longer available.");
    }
    await prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId: userId(request) } },
      update: {}, create: { meetingId: meeting.id, userId: userId(request) },
    });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.get("/:meetingId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const currentUserId = userId(request);
    await participantFor(meetingId, currentUserId);
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        host: { select: { id: true, accountId: true, nickname: true } },
        confirmedPlace: true,
        participants: { include: { user: { select: { id: true, accountId: true, nickname: true, homeLatitude: true, homeLongitude: true } } } },
        invitations: {
          include: {
            invitedUser: { select: { id: true, accountId: true, nickname: true } },
            invitedBy: { select: { id: true, accountId: true, nickname: true } },
          },
        },
        placeCandidates: {
          include: {
            votes: { select: { userId: true } },
            travelEstimates: { include: { user: { select: { id: true, accountId: true, nickname: true } } } },
          },
        },
      },
    });
    if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
    const maskedParticipants = meeting.participants.map((p) => {
      if (p.userId === currentUserId) return p;
      const { originLatitude: _1, originLongitude: _2, originAddress: _3, ...rest } = p as Record<string, unknown>;
      const user = p.user as Record<string, unknown>;
      const { homeLatitude: _4, homeLongitude: _5, ...userRest } = user;
      return { ...rest, originLatitude: null, originLongitude: null, originAddress: null, user: userRest };
    });
    const memberStatuses = [
      toMeetingMemberStatusEntry({
        user: meeting.host,
        status: "OWNER",
        invitationId: null,
        respondedAt: null,
      }),
      ...meeting.invitations.map((invitation) =>
        toMeetingMemberStatusEntry({
          user: invitation.invitedUser,
          status: invitation.status,
          invitationId: invitation.id,
          respondedAt: invitation.respondedAt,
        })),
    ];
    response.json({ success: true, data: { ...meeting, participants: maskedParticipants, memberStatuses } });
  } catch (error) { next(error); }
});

meetingsRouter.patch("/:meetingId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const host = await hostFor(meetingId, userId(request));
    if (host.meeting.status === "COMPLETED" || host.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is no longer editable.");
    }
    const input = meetingUpdateSchema.parse(request.body);
    if (input.scheduledAt && input.scheduledAt.getTime() < Date.now() + 30 * 60_000) {
      throw new AppError(400, "MEETING_TIME_TOO_SOON", "The meeting must start at least 30 minutes from now.");
    }
    const meeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: input,
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "DETAILS" });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.patch("/:meetingId/cancel", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const host = await hostFor(meetingId, userId(request));
    const hostUser = await prisma.user.findUnique({ where: { id: host.meeting.hostId }, select: { nickname: true } });
    if (host.meeting.status === "COMPLETED" || host.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is already closed.");
    }
    const members = await prisma.meetingParticipant.findMany({
      where: { meetingId, userId: { not: host.meeting.hostId } },
      select: { userId: true },
    });
    const meeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "CANCELLED",
        participants: { updateMany: { where: {}, data: { locationConsent: false, sharingStatus: "NOT_STARTED" } } },
      },
    });
    for (const member of members) {
      await createNotification({
        userId: member.userId,
        type: "MEETING_CANCELLED",
        title: "모임이 취소됐어요",
        body: `"${meeting.title}" 모임을 ${hostUser?.nickname ?? "방장"}님이 취소했습니다.`,
        data: { meetingId, actorId: host.meeting.hostId },
      });
    }
    emitMeetingUpdated(meetingId, { meetingId, reason: "STATUS" });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.delete("/:meetingId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const host = await hostFor(meetingId, userId(request));
    if (host.meeting.status !== "COMPLETED" && host.meeting.status !== "CANCELLED") {
      throw new AppError(409, "MEETING_MUST_BE_CLOSED", "Cancel or complete the meeting before deleting it.");
    }
    await prisma.meeting.delete({ where: { id: meetingId } });
    response.status(204).send();
  } catch (error) { next(error); }
});

meetingsRouter.delete("/:meetingId/invitations/:invitationId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const invitationId = idSchema.parse(request.params.invitationId);
    await hostFor(meetingId, userId(request));
    const invitation = await prisma.meetingInvitation.findFirst({
      where: { id: invitationId, meetingId, status: "PENDING" },
      include: { meeting: { select: { title: true, hostId: true, host: { select: { nickname: true } } } } },
    });
    if (!invitation) throw new AppError(404, "PENDING_INVITATION_NOT_FOUND", "Pending invitation was not found.");
    await prisma.meetingInvitation.delete({ where: { id: invitationId } });
    await createNotification({
      userId: invitation.invitedUserId,
      type: "MEETING_INVITATION_CANCELLED",
      title: "모임 초대가 취소됐어요",
      body: `"${invitation.meeting.title}" 모임 초대를 ${invitation.meeting.host.nickname}님이 취소했습니다.`,
      data: { meetingId, actorId: invitation.meeting.hostId },
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "MEMBERS" });
    response.status(204).send();
  } catch (error) { next(error); }
});

meetingsRouter.delete("/:meetingId/participants/:participantUserId", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const participantUserId = idSchema.parse(request.params.participantUserId);
    const host = await hostFor(meetingId, userId(request));
    if (participantUserId === host.meeting.hostId) {
      throw new AppError(400, "CANNOT_REMOVE_HOST", "The meeting host cannot be removed.");
    }
    const participant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: participantUserId } },
      include: { user: { select: { nickname: true } } },
    });
    if (!participant) throw new AppError(404, "PARTICIPANT_NOT_FOUND", "Participant was not found.");
    const hostUser = await prisma.user.findUnique({ where: { id: host.meeting.hostId }, select: { nickname: true } });
    await prisma.$transaction([
      prisma.meetingParticipant.delete({ where: { id: participant.id } }),
      prisma.meetingInvitation.deleteMany({ where: { meetingId, invitedUserId: participantUserId } }),
    ]);
    await createNotification({
      userId: participantUserId,
      type: "MEETING_PARTICIPANT_REMOVED",
      title: "모임 참여가 취소됐어요",
      body: `${hostUser?.nickname ?? "방장"}님이 "${host.meeting.title}" 모임에서 제외했습니다.`,
      data: { meetingId, actorId: host.meeting.hostId },
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "MEMBERS" });
    response.status(204).send();
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/invitations", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const hostId = userId(request);
    const host = await hostFor(meetingId, hostId);
    if (host.meeting.status === "COMPLETED" || host.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_CLOSED", "This meeting is no longer available.");
    }
    if (!canInviteToMeeting(host.meeting.scheduledAt)) {
      throw new AppError(409, "INVITATION_WINDOW_CLOSED", "Friends can only be invited until 30 minutes before the meeting starts.");
    }

    const input = additionalInviteesSchema.parse(request.body);
    const invitees = await resolveInvitees({ inviteeUserIds: input.inviteeUserIds, hostId });
    const friendCount = await prisma.friendship.count({
      where: {
        OR: invitees.map((invitee) => hostId < invitee.id
          ? { userAId: hostId, userBId: invitee.id }
          : { userAId: invitee.id, userBId: hostId }),
      },
    });
    if (friendCount !== invitees.length) {
      throw new AppError(403, "INVITEES_MUST_BE_FRIENDS", "Only accepted friends can be invited.");
    }

    const [existingInvitationCount, participantCount] = await Promise.all([
      prisma.meetingInvitation.count({
        where: { meetingId, invitedUserId: { in: invitees.map((invitee) => invitee.id) } },
      }),
      prisma.meetingParticipant.count({
        where: { meetingId, userId: { in: invitees.map((invitee) => invitee.id) } },
      }),
    ]);
    if (existingInvitationCount || participantCount) {
      throw new AppError(409, "ALREADY_INVITED", "One or more friends are already invited or participating.");
    }

    await prisma.meetingInvitation.createMany({
      data: invitees.map((invitee) => ({ meetingId, invitedUserId: invitee.id, invitedById: hostId })),
    });
    const invitations = await prisma.meetingInvitation.findMany({
      where: { meetingId, invitedUserId: { in: invitees.map((invitee) => invitee.id) } },
      include: {
        meeting: { select: { title: true, scheduledAt: true } },
        invitedBy: { select: { id: true, accountId: true, nickname: true } },
        invitedUser: { select: { id: true, accountId: true, nickname: true } },
      },
    });
    for (const invitation of invitations) {
      await createNotification({
        userId: invitation.invitedUserId,
        type: "MEETING_INVITATION",
        title: "모임 초대가 도착했어요",
        body: `${invitation.invitedBy.nickname}님이 "${invitation.meeting.title}" 모임에 초대했습니다.`,
        data: { invitationId: invitation.id, meetingId: invitation.meetingId },
      });
      emitMeetingInvitationReceived(invitation.invitedUserId, {
        invitation: toMeetingInvitationSummary(invitation),
      });
    }

    response.status(201).json({ success: true, data: { invitations: invitations.map(toMeetingInvitationSummary) } });
  } catch (error) { next(error); }
});

meetingsRouter.put("/:meetingId/origin", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await participantFor(meetingId, userId(request));
    const origin = originSchema.parse(request.body);
    const participant = await prisma.meetingParticipant.update({
      where: { meetingId_userId: { meetingId, userId: userId(request) } },
      data: {
        originType: origin.originType,
        originAddress: origin.address,
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
      },
    });
    response.json({ success: true, data: participant });
  } catch (error) { next(error); }
});

const recommendationInputSchema = z.object({
  candidates: z.array(z.object({
    name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(255),
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), category: z.string().trim().min(1).max(50),
    travelEstimates: z.array(z.object({ userId: idSchema, durationMinutes: z.number().int().positive().max(1440), distanceMeters: z.number().int().nonnegative().max(2_000_000) })).min(1),
  })).min(1).max(10),
});

meetingsRouter.post("/:meetingId/recommendations", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const host = await hostFor(meetingId, userId(request));
    if (host.meeting.status !== "PLANNING") throw new AppError(409, "MEETING_NOT_PLANNING", "Recommendations can only be changed while planning.");
    const input = recommendationInputSchema.parse(request.body);
    const participants = await prisma.meetingParticipant.findMany({ where: { meetingId }, select: { userId: true } });
    const participantIds = new Set(participants.map((participant) => participant.userId));
    for (const candidate of input.candidates) {
      const suppliedIds = new Set(candidate.travelEstimates.map((estimate) => estimate.userId));
      if (suppliedIds.size !== participantIds.size || [...participantIds].some((id) => !suppliedIds.has(id))) {
        throw new AppError(400, "INCOMPLETE_TRAVEL_ESTIMATES", "Every candidate needs one travel estimate for each participant.");
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.placeCandidate.deleteMany({ where: { meetingId } });
      for (const candidate of input.candidates) {
        const { travelEstimates, ...place } = candidate;
        await tx.placeCandidate.create({
          data: {
            ...place,
            meetingId,
            travelEstimates: { create: travelEstimates },
          },
        });
      }
    });
    const candidates = await prisma.placeCandidate.findMany({ where: { meetingId }, include: { travelEstimates: { include: { user: { select: { id: true, accountId: true, nickname: true } } } } } });
    const recommendations = candidates.map(recommendationSummary).sort((a, b) => a.maximumDurationMinutes - b.maximumDurationMinutes || a.timeGapMinutes - b.timeGapMinutes || a.averageDurationMinutes - b.averageDurationMinutes);
    response.status(201).json({ success: true, data: { recommendations } });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/place-candidates", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const viewerId = userId(request);
    const participant = await participantFor(meetingId, viewerId);
    if (participant.meeting.status !== "PLANNING") throw new AppError(409, "MEETING_NOT_PLANNING", "Places can only be added while planning.");
    const input = z.object({
      name: z.string().trim().min(1).max(120),
      address: z.string().trim().min(1).max(255),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      category: z.string().trim().min(1).max(50).default("직접 추천"),
    }).parse(request.body);
    const candidate = await prisma.placeCandidate.create({
      data: { ...input, meetingId, createdById: viewerId },
      include: { votes: { select: { userId: true } } },
    });
    response.status(201).json({ success: true, data: { candidate } });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/votes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await participantFor(meetingId, userId(request));
    const { placeCandidateId } = z.object({ placeCandidateId: idSchema }).parse(request.body);
    const candidate = await prisma.placeCandidate.findFirst({ where: { id: placeCandidateId, meetingId } });
    if (!candidate) throw new AppError(404, "PLACE_NOT_FOUND", "Place candidate was not found.");
    const vote = await prisma.vote.upsert({
      where: { meetingId_userId: { meetingId, userId: userId(request) } },
      update: { placeCandidateId }, create: { meetingId, placeCandidateId, userId: userId(request) },
    });
    await evaluateMeetingVote(meetingId);
    response.json({ success: true, data: vote });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/votes/finalize", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await hostFor(meetingId, userId(request));
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
    if (meeting.confirmedPlaceId) throw new AppError(409, "VOTE_ALREADY_FINALIZED", "Vote has already been finalized.");
    const { finalizeMeetingVote: doFinalize } = await import("../services/meetings.js");
    await doFinalize(meetingId);
    const updated = await prisma.meeting.findUnique({ where: { id: meetingId }, include: { confirmedPlace: true } });
    response.json({ success: true, data: updated });
  } catch (error) { next(error); }
});

meetingsRouter.patch("/:meetingId/confirm", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await hostFor(meetingId, userId(request));
    const { placeCandidateId } = z.object({ placeCandidateId: idSchema }).parse(request.body);
    const candidate = await prisma.placeCandidate.findFirst({ where: { id: placeCandidateId, meetingId } });
    if (!candidate) throw new AppError(404, "PLACE_NOT_FOUND", "Place candidate was not found.");
    const meeting = await prisma.meeting.update({ where: { id: meetingId }, data: { confirmedPlaceId: placeCandidateId, status: "CONFIRMED" }, include: { confirmedPlace: true } });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.patch("/:meetingId/location-consent", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await participantFor(meetingId, userId(request));
    const { consent } = z.object({ consent: z.boolean() }).parse(request.body);
    const participant = await prisma.meetingParticipant.update({ where: { meetingId_userId: { meetingId, userId: userId(request) } }, data: { locationConsent: consent, sharingStatus: consent ? undefined : "NOT_STARTED" } });
    response.json({ success: true, data: participant });
  } catch (error) { next(error); }
});

meetingsRouter.patch("/:meetingId/readiness", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await participantFor(meetingId, userId(request));
    const { ready } = z.object({ ready: z.boolean() }).parse(request.body);
    const participant = await prisma.meetingParticipant.update({ where: { meetingId_userId: { meetingId, userId: userId(request) } }, data: { readinessVerifiedAt: ready ? new Date() : null } });
    response.json({ success: true, data: participant });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/pokes", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    const senderId = userId(request);
    const senderParticipant = await participantFor(meetingId, senderId);
    const { targetId, clientRequestId } = z.object({
      targetId: idSchema,
      clientRequestId: idSchema,
    }).parse(request.body);
    if (targetId === senderId) throw new AppError(400, "INVALID_POKE_TARGET", "You cannot poke yourself.");
    if (!senderParticipant.arrivedAt) {
      throw new AppError(403, "SENDER_NOT_ARRIVED", "Only arrived participants can poke late members.");
    }
    if (senderParticipant.meeting.scheduledAt > new Date()) {
      throw new AppError(409, "MEETING_NOT_STARTED", "The meeting has not started.");
    }
    if (senderParticipant.meeting.status === "COMPLETED" || senderParticipant.meeting.status === "CANCELLED") {
      throw new AppError(409, "MEETING_ENDED", "The meeting has ended.");
    }
    const target = await participantFor(meetingId, targetId);
    if (target.arrivedAt) throw new AppError(409, "TARGET_ALREADY_ARRIVED", "The target has already arrived.");
    const poke = await prisma.poke.upsert({
      where: { senderId_clientRequestId: { senderId, clientRequestId } },
      update: {},
      create: { meetingId, senderId, targetId, type: "MEETING", clientRequestId },
    });
    await evaluateMeetingVote(meetingId);
    const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { nickname: true } });
    emitPoke(targetId, {
      pokeId: poke.id,
      meetingId,
      type: "MEETING",
      senderId,
      senderNickname: sender.nickname,
      sentAt: poke.createdAt.toISOString(),
    });
    await createNotification({
      userId: targetId,
      type: "MEETING_POKE",
      title: `${sender.nickname}님이 모임에서 찔렀어요`,
      body: `${senderParticipant.meeting.title} 모임에 늦고 있습니다.`,
      data: { meetingId, pokeId: poke.id, senderId },
    });
    response.status(201).json({ success: true, data: poke });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/complete", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await hostFor(meetingId, userId(request));
    const meeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        locationPurgeAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        participants: { updateMany: { where: {}, data: { locationConsent: false, sharingStatus: "NOT_STARTED" } } },
      },
    });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});
