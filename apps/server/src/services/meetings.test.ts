import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMeetingRecordingObjects: vi.fn(),
}));

vi.mock("./call-recordings.js", () => ({
  CALL_RECORDING_RETENTION_MS: 86_400_000,
  deleteMeetingRecordingObjects: mocks.deleteMeetingRecordingObjects,
}));

vi.mock("../realtime/events.js", () => ({
  emitMeetingUpdated: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    placeCandidate: { findMany: vi.fn() },
    meetingParticipant: { findMany: vi.fn(), updateMany: vi.fn() },
    locationSample: { deleteMany: vi.fn() },
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
      .mockResolvedValueOnce([]);
    mocks.deleteMeetingRecordingObjects.mockResolvedValue(false);

    await processMeetingLifecycle(new Date("2026-08-27T12:00:00.000Z"));

    expect(prisma.meeting.delete).not.toHaveBeenCalled();
  });
});
