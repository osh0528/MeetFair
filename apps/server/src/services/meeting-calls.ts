import type { MeetingCallSummary } from "@meetfair/shared";
import { createNotification } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { emitMeetingCallIncoming } from "../realtime/events.js";

function summaryFor(call: {
  id: string;
  meetingId: string;
  roomName: string;
  status: "RINGING" | "ACTIVE" | "ENDED";
  createdAt: Date;
  meeting: { title: string };
}, participantStatus: "RINGING" | "JOINED" | "DECLINED" | "MISSED" | "LEFT"): MeetingCallSummary {
  return {
    id: call.id,
    meetingId: call.meetingId,
    meetingTitle: call.meeting.title,
    roomName: call.roomName,
    status: call.status,
    participantStatus,
    createdAt: call.createdAt.toISOString(),
  };
}

export async function endMeetingCallIfInactive(callId: string) {
  const activeParticipantCount = await prisma.meetingCallParticipant.count({
    where: { callId, status: { in: ["RINGING", "JOINED"] } },
  });
  if (activeParticipantCount > 0) return;
  await prisma.meetingCall.updateMany({
    where: { id: callId, status: { not: "ENDED" } },
    data: { status: "ENDED", endedAt: new Date() },
  });
}

export async function processDueMeetingCalls() {
  const now = new Date();
  const meetings = await prisma.meeting.findMany({
    where: {
      scheduledAt: { lte: now },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      calls: { none: {} },
    },
    include: {
      participants: true,
    },
    take: 20,
  });
  for (const meeting of meetings) {
    const late = meeting.participants.filter((participant) => !participant.arrivedAt);
    if (!late.length) continue;
    const targetIds = [...new Set([meeting.hostId, ...late.map((participant) => participant.userId)])];
    const call = await prisma.meetingCall.create({
      data: {
        meetingId: meeting.id,
        roomName: `meeting-${meeting.id}-${Date.now()}`,
        participants: { create: targetIds.map((targetId) => ({ userId: targetId })) },
      },
      include: { meeting: { select: { title: true } }, participants: true },
    });
    for (const participant of call.participants) {
      const summary = summaryFor(call, participant.status);
      emitMeetingCallIncoming(participant.userId, { call: summary });
      await createNotification({
        userId: participant.userId,
        type: "MEETING_CALL_INCOMING",
        title: "모임 영상통화",
        body: `${meeting.title} 모임에 지각자가 있어 영상통화가 시작됐습니다.`,
        data: { callId: call.id, meetingId: meeting.id },
      });
    }
  }

  const missed = await prisma.meetingCallParticipant.findMany({
    where: {
      status: "RINGING",
      call: { createdAt: { lte: new Date(Date.now() - 30_000) } },
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
        title: "영상통화에 응답하지 않았어요",
        body: `${participant.call.meeting.title} 모임이 기다리고 있습니다.`,
        data: { callId: participant.callId, meetingId: participant.call.meetingId },
      });
    }
    await endMeetingCallIfInactive(participant.callId);
  }

  const staleCalls = await prisma.meetingCall.findMany({
    where: {
      status: { not: "ENDED" },
      createdAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  for (const call of staleCalls) {
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
        data: { status: "ENDED", endedAt: now },
      }),
    ]);
  }
}
