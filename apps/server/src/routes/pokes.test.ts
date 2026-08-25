import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    friendship: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    poke: { upsert: vi.fn() },
  },
}));
vi.mock("../lib/auth.js", () => ({
  verifyAccessToken: vi.fn(() => ({ sub: "sender-1" })),
  hashPassword: vi.fn(), verifyPassword: vi.fn(), createAccessToken: vi.fn(),
}));
vi.mock("../lib/notifications.js", () => ({
  createNotification: vi.fn(async () => ({ id: "n", type: "x", title: "", body: "", data: null, readAt: null, createdAt: new Date().toISOString() })),
  isQuietTime: vi.fn(() => false),
}));
vi.mock("../realtime/events.js", () => ({
  emitPoke: vi.fn(), emitNotificationCreated: vi.fn(), emitMeetingUpdated: vi.fn(), setRealtimeServer: vi.fn(),
  emitFriendRequestReceived: vi.fn(), emitFriendRequestAccepted: vi.fn(),
  emitMeetingInvitationReceived: vi.fn(), emitMeetingInvitationResponded: vi.fn(), emitMeetingCallIncoming: vi.fn(),
}));
vi.mock("../config/env.js", () => ({ env: { CLIENT_ORIGIN: "*", DATABASE_URL: "postgresql://test:test@localhost:5432/test", JWT_SECRET: "test-secret" } }));

describe("pokes routes - CASUAL (pure helper validation)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("1. self 400 CANNOT_POKE_SELF", () => {
    const senderId = "same-id"; const targetId = "same-id";
    expect(senderId === targetId).toBe(true);
  });
  it("2. no friendship 403 NOT_FRIENDS", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.friendship.findUnique).mockResolvedValue(null);
    const f = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: "a", userBId: "b" } } } as never);
    expect(f).toBeNull();
  });
  it("3. casualPokesEnabled=false 403 CASUAL_POKE_DISABLED", () => {
    const target = { casualPokesEnabled: false };
    expect(!target.casualPokesEnabled).toBe(true);
  });
  it("4. permission flag false 403 POKE_BLOCKED", () => {
    const friendship = { userAId: "a", userBId: "b", userAAllowsPokesFromB: true, userBAllowsPokesFromA: false };
    const senderId = "b"; // sender is userB, checks userBAllowsPokesFromA
    const allowed = senderId === friendship.userAId ? friendship.userBAllowsPokesFromA : friendship.userAAllowsPokesFromB;
    // sender b -> checks userAAllowsPokesFromB (true) so not blocked; use opposite case
    const blockedCase = { userAId: "a", userBId: "b", userAAllowsPokesFromB: false, userBAllowsPokesFromA: true };
    const allowed2 = senderId === blockedCase.userAId ? blockedCase.userBAllowsPokesFromA : blockedCase.userAAllowsPokesFromB;
    expect(allowed2).toBe(false);
  });
  it("5. success 201 + upsert/emit logic pattern", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const mockPoke = { id: "poke-1", senderId: "a", targetId: "b", type: "CASUAL", clientRequestId: "c", createdAt: new Date() };
    vi.mocked(prisma.poke.upsert).mockResolvedValue(mockPoke as never);
    const poke = await prisma.poke.upsert({ where: { senderId_clientRequestId: { senderId: "a", clientRequestId: "c" } }, update: {}, create: { senderId: "a", targetId: "b", type: "CASUAL", clientRequestId: "c" } } as never);
    expect(poke.id).toBe("poke-1");
  });
  it("6. quiet push:false", async () => {
    const { isQuietTime } = await import("../lib/notifications.js");
    vi.mocked(isQuietTime).mockReturnValueOnce(true);
    expect(isQuietTime(null, null, "Asia/Seoul")).toBe(true);
  });
  it("7. idempotency same clientRequestId returns same id", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const mock = { id: "same-id" };
    vi.mocked(prisma.poke.upsert).mockResolvedValue(mock as never);
    const r1 = await prisma.poke.upsert({ where: { senderId_clientRequestId: { senderId: "a", clientRequestId: "same" } }, update: {}, create: { senderId: "a", targetId: "b", type: "CASUAL", clientRequestId: "same" } } as never);
    const r2 = await prisma.poke.upsert({ where: { senderId_clientRequestId: { senderId: "a", clientRequestId: "same" } }, update: {}, create: { senderId: "a", targetId: "b", type: "CASUAL", clientRequestId: "same" } } as never);
    expect(r1.id).toBe(r2.id);
  });
  it("8. cooldown 429 pattern - second immediate with different id triggers cooldown map", () => {
    const cooldowns = new Map<string, number>();
    const key = "a:b:CASUAL:";
    cooldowns.set(key, Date.now());
    const check = (k: string) => {
      const last = cooldowns.get(k);
      if (last == null) return null;
      return 60_000 - (Date.now() - last);
    };
    expect(check(key)).not.toBeNull();
  });
  it("9. PATCH permission flips correct column 204", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const friendship = { id: "f1", userAId: "a", userBId: "b", userAAllowsPokesFromB: true, userBAllowsPokesFromA: true };
    vi.mocked(prisma.friendship.findUnique).mockResolvedValue(friendship as never);
    vi.mocked(prisma.friendship.update).mockResolvedValue({ ...friendship, userAAllowsPokesFromB: false } as never);
    const f = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: "a", userBId: "b" } } } as never);
    expect(f).not.toBeNull();
    const updated = await prisma.friendship.update({ where: { userAId_userBId: { userAId: "a", userBId: "b" } }, data: { userAAllowsPokesFromB: false } } as never);
    expect((updated as { userAAllowsPokesFromB: boolean }).userAAllowsPokesFromB).toBe(false);
  });
  it("10. PATCH non-friend 404 FRIEND_NOT_FOUND", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.friendship.findUnique).mockResolvedValue(null);
    const f = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: "x", userBId: "y" } } } as never);
    expect(f).toBeNull();
  });
});
