import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  emitMeetingCallIncoming: vi.fn(),
  stopCallRecording: vi.fn(),
}));

vi.mock("../lib/notifications.js", () => ({ createNotification: mocks.createNotification }));
vi.mock("../realtime/events.js", () => ({ emitMeetingCallIncoming: mocks.emitMeetingCallIncoming }));
vi.mock("./call-recordings.js", () => ({ stopCallRecording: mocks.stopCallRecording }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meeting: { findMany: vi.fn() },
    meetingCall: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    meetingCallParticipant: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    meetingParticipant: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

describe("meeting call modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("marks a summary as forced only for a late participant", async () => {
    const { summaryFor } = await import("./meeting-calls.js");
    const call = {
      id: "call-1",
      meetingId: "meeting-1",
      roomName: "room-1",
      status: "ACTIVE" as const,
      createdAt: new Date("2026-08-31T01:00:00.000Z"),
      meeting: { title: "테스트 모임" },
    };

    expect(summaryFor(call, { status: "JOINED", forcedAt: null }).forced).toBe(false);
    expect(summaryFor(call, { status: "RINGING", forcedAt: new Date() }).forced).toBe(true);
  });

  it("keeps an empty voluntary call open until the meeting starts", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { endMeetingCallIfInactive } = await import("./meeting-calls.js");
    vi.mocked(prisma.meetingCall.findUnique).mockResolvedValue({
      forcedAt: null,
      meeting: { scheduledAt: new Date(Date.now() + 60_000) },
    } as never);

    await endMeetingCallIfInactive("call-1");

    expect(prisma.meetingCallParticipant.count).not.toHaveBeenCalled();
    expect(prisma.meetingCall.updateMany).not.toHaveBeenCalled();
  });

  it("adds only non-arrived participants when a voluntary room already exists", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processDueMeetingCalls } = await import("./meeting-calls.js");
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([{
      id: "meeting-1",
      title: "테스트 모임",
      hostId: "host-1",
      participants: [
        { userId: "host-1", arrivedAt: new Date() },
        { userId: "late-1", arrivedAt: null },
      ],
    }] as never);
    vi.mocked(prisma.meetingCall.findUnique).mockResolvedValue({ id: "call-1" } as never);
    vi.mocked(prisma.meetingCall.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingCallParticipant.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingCallParticipant.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.meetingCall.findUniqueOrThrow).mockResolvedValue({
      id: "call-1",
      meetingId: "meeting-1",
      roomName: "room-1",
      status: "ACTIVE",
      createdAt: new Date(),
      meeting: { title: "테스트 모임" },
      participants: [{ userId: "late-1", status: "RINGING", forcedAt: new Date() }],
    } as never);
    vi.mocked(prisma.meetingCallParticipant.findMany).mockResolvedValue([]);
    vi.mocked(prisma.meetingCall.findMany).mockResolvedValue([]);

    await processDueMeetingCalls();

    expect(prisma.meetingCallParticipant.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: "late-1", forcedAt: expect.any(Date) })],
    }));
    expect(mocks.emitMeetingCallIncoming).toHaveBeenCalledWith(
      "late-1",
      expect.objectContaining({ call: expect.objectContaining({ forced: true }) }),
    );
    expect(mocks.emitMeetingCallIncoming).not.toHaveBeenCalledWith("host-1", expect.anything());
  });
});
