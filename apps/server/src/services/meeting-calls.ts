import type { MeetingCallSummary } from "@meetfair/shared";
import { createNotification } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { emitMeetingCallIncoming } from "../realtime/events.js";
import { stopCallRecording } from "./call-recordings.js";
import { MINIMUM_CALL_DURATION_MS } from "./call-lock.js";

export function summaryFor(call: {
  id: string;
  meetingId: string;
  roomName: string;
  status: "RINGING" | "ACTIVE" | "ENDED";
  createdAt: Date;
  meeting: { title: string };
}, participant: {
  status: "RINGING" | "JOINED" | "DECLINED" | "MISSED" | "LEFT";
  forcedAt: Date | null;
}): MeetingCallSummary {
  return {
    id: call.id,
    meetingId: call.meetingId,
    meetingTitle: call.meeting.title,
    roomName: call.roomName,
    status: call.status,
    participantStatus: participant.status,
    forced: participant.forcedAt !== null,
    createdAt: call.createdAt.toISOString(),
  };
}

export async function endMeetingCallIfInactive(callId: string) {
  const call = await prisma.meetingCall.findUnique({
    where: { id: callId },
    select: { forcedAt: true, meeting: { select: { scheduledAt: true } } },
  });
  if (!call) return;
  if (!call.forcedAt && call.meeting.scheduledAt > new Date()) return;
  if (call.forcedAt && call.forcedAt.getTime() + MINIMUM_CALL_DURATION_MS > Date.now()) return;
  const activeParticipantCount = await prisma.meetingCallParticipant.count({
    where: { callId, status: { in: ["RINGING", "JOINED"] } },
  });
  if (activeParticipantCount > 0) return;
  const endedAt = new Date();
  const result = await prisma.meetingCall.updateMany({
    where: { id: callId, status: { not: "ENDED" } },
    data: { status: "ENDED", endedAt },
  });
  if (result.count) {
    await stopCallRecording(callId, endedAt).catch((error) => {
      console.error("Call recording stop failed; it will be retried", error);
    });
  }
}

export async function processDueMeetingCalls() {
  const now = new Date();
  const meetings = await prisma.meeting.findMany({
    where: {
      scheduledAt: { lte: now },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      participants: { some: { arrivedAt: null } },
      OR: [
        { calls: { none: {} } },
        { calls: { some: { forcedAt: null } } },
      ],
    },
    include: {
      participants: true,
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  for (const meeting of meetings) {
    const late = meeting.participants.filter((participant) => !participant.arrivedAt);
    if (!late.length) continue;
    const targetIds = [...new Set(late.map((participant) => participant.userId))];
    const existingCall = await prisma.meetingCall.findUnique({ where: { meetingId: meeting.id } });
    let callId: string;
    if (existingCall) {
      const claimed = await prisma.meetingCall.updateMany({
        where: { id: existingCall.id, forcedAt: null },
        data: { forcedAt: now },
      });
      if (!claimed.count) continue;
      callId = existingCall.id;
      await prisma.meetingCallParticipant.createMany({
        data: targetIds.map((targetId) => ({ callId, userId: targetId, ringingAt: now, forcedAt: now })),
        skipDuplicates: true,
      });
      await prisma.meetingCallParticipant.updateMany({
        where: { callId, userId: { in: targetIds }, status: { not: "JOINED" } },
        data: { status: "RINGING", ringingAt: now, forcedAt: now, respondedAt: null, leftAt: null },
      });
      await prisma.meetingCallParticipant.updateMany({
        where: { callId, userId: { in: targetIds }, status: "JOINED" },
        data: { forcedAt: now },
      });
    } else {
      try {
        const created = await prisma.meetingCall.create({
          data: {
            meetingId: meeting.id,
            roomName: `meeting-${meeting.id}-${Date.now()}`,
            forcedAt: now,
            participants: {
              create: targetIds.map((targetId) => ({ userId: targetId, ringingAt: now, forcedAt: now })),
            },
          },
        });
        callId = created.id;
      } catch (error) {
        if (error instanceof Error && (error as unknown as { code?: string }).code === "P2002") continue;
        throw error;
      }
    }
    const call = await prisma.meetingCall.findUniqueOrThrow({
      where: { id: callId },
      include: { meeting: { select: { title: true } }, participants: true },
    });
    for (const participant of call.participants.filter((item) => targetIds.includes(item.userId) && item.status === "RINGING")) {
      const summary = summaryFor(call, participant);
      emitMeetingCallIncoming(participant.userId, { call: summary });
      await createNotification({
        userId: participant.userId,
        type: "MEETING_CALL_INCOMING",
        title: "모임 시작 · 영상통화 자동 참여",
        body: `${meeting.title} 모임에 아직 도착하지 않아 영상통화가 시작됐습니다.`,
        data: { callId: call.id, meetingId: meeting.id },
        important: true,
      });
    }
  }

  const missed = await prisma.meetingCallParticipant.findMany({
    where: {
      status: "RINGING",
      forcedAt: { not: null },
      ringingAt: { lte: new Date(now.getTime() - 30_000) },
    },
    include: { call: { include: { meeting: true } } },
  });
  for (const participant of missed) {
    await prisma.meetingCallParticipant.update({
      where: { id: participant.id },
      data: { status: "MISSED", respondedAt: now },
    });
    const meetingParticipant = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: participant.call.meetingId, userId: participant.userId } },
    });
    if (meetingParticipant && !meetingParticipant.arrivedAt) {
      await createNotification({
        userId: participant.userId,
        type: "AUTOMATIC_MEETING_POKE",
        title: "영상통화에 연결되지 않았어요",
        body: `${participant.call.meeting.title} 모임이 기다리고 있습니다. 앱을 열어 참여해 주세요.`,
        data: { callId: participant.callId, meetingId: participant.call.meetingId },
        important: true,
      });
    }
    await endMeetingCallIfInactive(participant.callId);
  }

  const staleCalls = await prisma.meetingCall.findMany({
    where: {
      status: { not: "ENDED" },
      OR: [
        { forcedAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) } },
        { forcedAt: null, meeting: { scheduledAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) } } },
      ],
    },
    select: { id: true },
  });
  for (const call of staleCalls) {
    const endedAt = new Date();
    await prisma.$transaction([
      prisma.meetingCallParticipant.updateMany({
        where: { callId: call.id, status: "RINGING" },
        data: { status: "MISSED", respondedAt: now },
      }),
      prisma.meetingCallParticipant.updateMany({
        where: { callId: call.id, status: "JOINED" },
        data: { status: "LEFT", leftAt: now },
      }),
      prisma.meetingCall.update({
        where: { id: call.id },
        data: { status: "ENDED", endedAt },
      }),
    ]);
    await stopCallRecording(call.id, endedAt).catch((error) => {
      console.error("Stale call recording stop failed; it will be retried", error);
    });
  }
}
