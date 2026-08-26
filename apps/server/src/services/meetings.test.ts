import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMeetingRecordingObjects: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("./call-recordings.js", () => ({
  CALL_RECORDING_RETENTION_MS: 86_400_000,
  deleteMeetingRecordingObjects: mocks.deleteMeetingRecordingObjects,
}));

vi.mock("../realtime/events.js", () => ({
  emitMeetingUpdated: vi.fn(),
}));

vi.mock("../lib/notifications.js", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    placeCandidate: { findMany: vi.fn() },
    meetingParticipant: { findMany: vi.fn(), updateMany: vi.fn() },
    locationSample: { deleteMany: vi.fn() },
    recordingAccessLog: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

describe("meeting lifecycle retention", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a meeting and its cascaded chat after 24 hours", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processMeetingLifecycle } = await import("./meetings.js");
    vi.mocked(prisma.meeting.findMany)
      .mockResolvedValueOnce([{ id: "meeting-1" }] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.deleteMeetingRecordingObjects.mockResolvedValue(true);
    const now = new Date("2026-08-27T12:00:00.000Z");

    await processMeetingLifecycle(now);

    expect(vi.mocked(prisma.meeting.findMany)).toHaveBeenNthCalledWith(1, {
      where: { scheduledAt: { lte: new Date("2026-08-26T12:00:00.000Z") } },
      select: { id: true },
      take: 20,
    });
    expect(mocks.deleteMeetingRecordingObjects).toHaveBeenCalledWith("meeting-1", now);
    expect(prisma.meeting.delete).toHaveBeenCalledWith({ where: { id: "meeting-1" } });
  });

  it("keeps the meeting when its recording cannot be removed", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processMeetingLifecycle } = await import("./meetings.js");
    vi.mocked(prisma.meeting.findMany)
      .mockResolvedValueOnce([{ id: "meeting-2" }] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.deleteMeetingRecordingObjects.mockResolvedValue(false);

    await processMeetingLifecycle(new Date("2026-08-27T12:00:00.000Z"));

    expect(prisma.meeting.delete).not.toHaveBeenCalled();
  });

  it("warns every participant one hour before automatic deletion", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processMeetingLifecycle } = await import("./meetings.js");
    vi.mocked(prisma.meeting.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "meeting-3",
        title: "저녁 모임",
        hostId: "host-1",
        participants: [{ userId: "host-1" }, { userId: "user-2" }],
      }] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.meeting.updateMany).mockResolvedValue({ count: 1 });
    mocks.createNotification.mockResolvedValue({});

    await processMeetingLifecycle(new Date("2026-08-27T11:00:00.000Z"));

    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: "host-1",
      type: "MEETING_RETENTION_WARNING",
      data: { meetingId: "meeting-3" },
    }));
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-2" }));
  });
});
