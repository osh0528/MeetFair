import { prisma } from "../lib/prisma.js";
import { emitMeetingUpdated } from "../realtime/events.js";

async function leadingCandidate(meetingId: string) {
  const candidates = await prisma.placeCandidate.findMany({
    where: { meetingId },
    include: { _count: { select: { votes: true } } },
    orderBy: [{ recommendationRank: "asc" }, { id: "asc" }],
  });
  return candidates.sort((a, b) =>
    b._count.votes - a._count.votes
    || (a.recommendationRank ?? Number.MAX_SAFE_INTEGER) - (b.recommendationRank ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id))[0];
}

export async function finalizeMeetingVote(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.confirmedPlaceId) return;
  const candidate = await leadingCandidate(meetingId);
  if (!candidate) return;
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      confirmedPlaceId: candidate.id,
      status: "CONFIRMED",
      votingClosedAt: new Date(),
      placeFinalizedAt: new Date(),
      voteCountdownEndsAt: null,
    },
  });
  emitMeetingUpdated(meetingId, { meetingId, reason: "PLACE" });
}

export async function evaluateMeetingVote(meetingId: string) {
  const [meeting, participantCount, voteCount, leader] = await Promise.all([
    prisma.meeting.findUnique({ where: { id: meetingId } }),
    prisma.meetingParticipant.count({ where: { meetingId } }),
    prisma.vote.count({ where: { meetingId } }),
    leadingCandidate(meetingId),
  ]);
  if (!meeting || meeting.confirmedPlaceId || !leader) return;
  if (participantCount > 0 && voteCount === participantCount && !meeting.voteCountdownEndsAt) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { voteCountdownEndsAt: new Date(Date.now() + 20_000) },
    });
    emitMeetingUpdated(meetingId, { meetingId, reason: "VOTES" });
  }
}

function nextKoreanMidnight(scheduledAt: Date) {
  const korean = new Date(scheduledAt.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(
    korean.getUTCFullYear(),
    korean.getUTCMonth(),
    korean.getUTCDate() + 1,
  ) - 9 * 60 * 60 * 1000);
}

export async function processMeetingLifecycle() {
  const now = new Date();
  const dueVotes = await prisma.meeting.findMany({
    where: { confirmedPlaceId: null, voteCountdownEndsAt: { lte: now } },
    select: { id: true },
  });
  for (const meeting of dueVotes) await finalizeMeetingVote(meeting.id);

  const activeMeetings = await prisma.meeting.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, scheduledAt: { lte: now } },
    select: { id: true, scheduledAt: true },
  });
  for (const meeting of activeMeetings) {
    if (nextKoreanMidnight(meeting.scheduledAt) <= now) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          locationPurgeAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          participants: {
            updateMany: {
              where: {},
              data: { locationConsent: false, sharingStatus: "NOT_STARTED" },
            },
          },
        },
      });
      emitMeetingUpdated(meeting.id, { meetingId: meeting.id, reason: "LOCATION_SHARING" });
    }
  }

  const purgeMeetings = await prisma.meeting.findMany({
    where: { locationPurgeAt: { lte: now } },
    select: { id: true },
  });
  for (const meeting of purgeMeetings) {
    const participants = await prisma.meetingParticipant.findMany({
      where: { meetingId: meeting.id },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.locationSample.deleteMany({ where: { participantId: { in: participants.map((item) => item.id) } } }),
      prisma.meetingParticipant.updateMany({
        where: { meetingId: meeting.id },
        data: {
          lastLatitude: null,
          lastLongitude: null,
          lastAccuracy: null,
          lastLocationAt: null,
        },
      }),
      prisma.meeting.update({ where: { id: meeting.id }, data: { locationPurgeAt: null } }),
    ]);
  }
}
