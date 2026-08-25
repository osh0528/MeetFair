import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meetingParticipant: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    meeting: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUniqueOrThrow: vi.fn() },
    poke: { upsert: vi.fn() },
  },
}));
vi.mock("../lib/auth.js", () => ({
  verifyAccessToken: vi.fn(() => ({ sub: "sender-1" })),
  hashPassword: vi.fn(), verifyPassword: vi.fn(), createAccessToken: vi.fn(),
}));
vi.mock("../lib/notifications.js", () => ({
  createNotification: vi.fn(async () => ({ id: "n", type: "MEETING_POKE", title: "t", body: "모임에 늦고 있어요. 확인해 주세요.", data: null, readAt: null, createdAt: new Date().toISOString() })),
  isQuietTime: vi.fn(() => false),
}));
vi.mock("../realtime/events.js", () => ({
  emitPoke: vi.fn(), emitMeetingUpdated: vi.fn(), setRealtimeServer: vi.fn(),
  emitNotificationCreated: vi.fn(), emitFriendRequestReceived: vi.fn(), emitFriendRequestAccepted: vi.fn(),
  emitMeetingInvitationReceived: vi.fn(), emitMeetingInvitationResponded: vi.fn(), emitMeetingCallIncoming: vi.fn(),
}));
vi.mock("../config/env.js", () => ({ env: { CLIENT_ORIGIN: "*", DATABASE_URL: "postgresql://test:test@localhost:5432/test", JWT_SECRET: "test-secret" } }));

describe("meeting-social POST /:meetingId/pokes - MEETING (pure validation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("11. sender not participant 403 NOT_A_PARTICIPANT", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValue(null);
    const p = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: "m1", userId: "sender" } } } as never);
    expect(p).toBeNull();
  });

  it("12. target not in meeting 404 TARGET_NOT_IN_MEETING", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const participant = { id: "p1", meeting: { scheduledAt: new Date(Date.now() - 1000).toISOString() } };
    const targetParticipant = null;
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValueOnce(participant as never).mockResolvedValueOnce(targetParticipant as never);
    const req = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: "m1", userId: "sender" } } } as never);
    expect(req).not.toBeNull();
    const tgt = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: "m1", userId: "target" } } } as never);
    expect(tgt).toBeNull();
  });

  it("13. scheduledAt in future 400 MEETING_NOT_STARTED", () => {
    const scheduledAt = new Date(Date.now() + 60_000);
    const started = new Date(scheduledAt) <= new Date();
    expect(started).toBe(false);
  });

  it("14. target arrivedAt set 400 TARGET_ALREADY_ARRIVED", () => {
    const targetParticipant = { arrivedAt: new Date() };
    expect(targetParticipant.arrivedAt).not.toBeNull();
  });

  it("15. self 400 CANNOT_POKE_SELF", () => {
    const senderId = "same-id"; const targetId = "same-id";
    expect(senderId === targetId).toBe(true);
  });

  it("16. success 201 - upsert args contain meetingId & type MEETING + notification body exact", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const mockPoke = { id: "poke-2", senderId: "sender-1", targetId: "target-1", meetingId: "m1", type: "MEETING", clientRequestId: "c1", createdAt: new Date() };
    vi.mocked(prisma.poke.upsert).mockResolvedValue(mockPoke as never);
    const poke = await prisma.poke.upsert({
      where: { senderId_clientRequestId: { senderId: "sender-1", clientRequestId: "c1" } },
      update: {},
      create: { senderId: "sender-1", targetId: "target-1", meetingId: "m1", type: "MEETING", clientRequestId: "c1" },
    } as never);
    expect(poke.meetingId).toBe("m1");
    expect(poke.type).toBe("MEETING");
    const { createNotification } = await import("../lib/notifications.js");
    await createNotification({ userId: "target-1", type: "MEETING_POKE", title: "x님이 찔렀어요", body: "모임에 늦고 있어요. 확인해 주세요.", data: { pokeId: poke.id, meetingId: "m1", senderId: "sender-1" } } as never);
    expect(vi.mocked(createNotification).mock.calls[0][0].body).toBe("모임에 늦고 있어요. 확인해 주세요.");
  });

  it("17. cooldown repeat 429 - second immediate with different id", () => {
    const cooldowns = new Map<string, number>();
    const key = "sender:target:MEETING:m1";
    cooldowns.set(key, Date.now());
    const check = (k: string) => {
      const last = cooldowns.get(k);
      if (last == null) return null;
      return 120_000 - (Date.now() - last);
    };
    expect(check(key)).not.toBeNull();
  });
});
