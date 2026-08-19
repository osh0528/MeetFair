import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitPoke } from "../realtime/events.js";

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth);

const idSchema = z.string().uuid();
const meetingInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  scheduledAt: z.coerce.date().refine((date) => date > new Date(), "scheduledAt must be in the future"),
});
const originSchema = z.object({
  address: z.string().trim().min(1).max(255),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

function userId(request: AuthenticatedRequest): string {
  if (!request.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
  return request.userId;
}

async function participantFor(meetingId: string, currentUserId: string) {
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: currentUserId } },
    include: { meeting: true, user: { select: { id: true, nickname: true } } },
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
  travelEstimates: { userId: string; durationMinutes: number; distanceMeters: number; user: { nickname: string } }[];
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

meetingsRouter.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = meetingInputSchema.parse(request.body);
    const hostId = userId(request);
    let meeting;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        meeting = await prisma.meeting.create({
          data: {
            ...input, hostId, inviteCode: createInviteCode(),
            participants: { create: { userId: hostId } },
          },
        });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    response.status(201).json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: { participants: { some: { userId: userId(request) } } },
      include: { host: { select: { id: true, nickname: true } }, confirmedPlace: true, _count: { select: { participants: true } } },
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
    await participantFor(meetingId, userId(request));
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        host: { select: { id: true, nickname: true } }, confirmedPlace: true,
        participants: { include: { user: { select: { id: true, nickname: true } } } },
        placeCandidates: { include: { votes: { select: { userId: true } }, travelEstimates: { include: { user: { select: { nickname: true } } } } } },
      },
    });
    if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});

meetingsRouter.put("/:meetingId/origin", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await participantFor(meetingId, userId(request));
    const origin = originSchema.parse(request.body);
    const participant = await prisma.meetingParticipant.update({
      where: { meetingId_userId: { meetingId, userId: userId(request) } },
      data: { originAddress: origin.address, originLatitude: origin.latitude, originLongitude: origin.longitude },
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
    const candidates = await prisma.placeCandidate.findMany({ where: { meetingId }, include: { travelEstimates: { include: { user: { select: { nickname: true } } } } } });
    const recommendations = candidates.map(recommendationSummary).sort((a, b) => a.maximumDurationMinutes - b.maximumDurationMinutes || a.timeGapMinutes - b.timeGapMinutes || a.averageDurationMinutes - b.averageDurationMinutes);
    response.status(201).json({ success: true, data: { recommendations } });
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
    response.json({ success: true, data: vote });
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
    await participantFor(meetingId, userId(request));
    const { targetId } = z.object({ targetId: idSchema }).parse(request.body);
    if (targetId === userId(request)) throw new AppError(400, "INVALID_POKE_TARGET", "You cannot poke yourself.");
    await participantFor(meetingId, targetId);
    const poke = await prisma.poke.create({ data: { meetingId, senderId: userId(request), targetId } });
    const sender = await prisma.user.findUniqueOrThrow({ where: { id: userId(request) }, select: { nickname: true } });
    emitPoke(targetId, { meetingId, senderId: userId(request), senderNickname: sender.nickname, sentAt: poke.createdAt.toISOString() });
    response.status(201).json({ success: true, data: poke });
  } catch (error) { next(error); }
});

meetingsRouter.post("/:meetingId/complete", async (request: AuthenticatedRequest, response, next) => {
  try {
    const meetingId = idSchema.parse(request.params.meetingId);
    await hostFor(meetingId, userId(request));
    const meeting = await prisma.meeting.update({ where: { id: meetingId }, data: { status: "COMPLETED", participants: { updateMany: { where: {}, data: { locationConsent: false, sharingStatus: "NOT_STARTED" } } } } });
    response.json({ success: true, data: meeting });
  } catch (error) { next(error); }
});
