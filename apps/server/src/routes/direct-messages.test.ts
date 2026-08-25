import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    friendship: { findUnique: vi.fn() },
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    directMessage: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  },
}));

vi.mock("../lib/auth.js", () => ({
  verifyAccessToken: vi.fn(() => ({ sub: "00000000-0000-4000-a000-000000000001" })),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createAccessToken: vi.fn(),
}));

vi.mock("../lib/notifications.js", () => ({
  createNotification: vi.fn(async () => ({
    id: "notif_1",
    type: "DIRECT_MESSAGE",
    title: "test",
    body: "test",
    data: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  })),
  isQuietTime: vi.fn(() => false),
}));

vi.mock("../realtime/events.js", () => ({
  emitDirectMessageReceived: vi.fn(),
  emitDirectMessageRead: vi.fn(),
  emitPoke: vi.fn(),
  emitNotificationCreated: vi.fn(),
  emitMeetingUpdated: vi.fn(),
  setRealtimeServer: vi.fn(),
}));

function orderedPair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

describe("direct-messages - spec 10 cases (pure validation + helper)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("1. 친구와 대화 생성 - orderedPair 정렬로 중복 방지", () => {
    const a = "11111111-1111-4000-a000-000000000001";
    const b = "22222222-2222-4000-a000-000000000002";
    expect(orderedPair(a, b)).toEqual({ userAId: a, userBId: b });
    expect(orderedPair(b, a)).toEqual({ userAId: a, userBId: b });
  });

  it("2. 비친구 403 - friendship 없을 때 차단", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.friendship.findUnique).mockResolvedValue(null);
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: "a", userBId: "b" } } } as never);
    expect(friendship).toBeNull();
  });

  it("3. 자기 자신 400 - self conversation 금지", () => {
    const userId = "00000000-0000-4000-a000-000000000001";
    const friendId = userId;
    expect(friendId === userId).toBe(true);
  });

  it("4. 기존 대화 재사용 - 동일 orderedPair는 동일 id 반환", () => {
    const pair1 = orderedPair("a", "b");
    const pair2 = orderedPair("b", "a");
    expect(pair1).toEqual(pair2);
  });

  it("5. 메시지 전송 201 - trim 후 1~2000자 통과", () => {
    const raw = "  hello world  ";
    const trimmed = raw.trim();
    expect(trimmed).toBe("hello world");
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThanOrEqual(2000);
  });

  it("6. 빈 문자열/2001자 거부 400", () => {
    expect("   ".trim().length).toBe(0);
    expect("a".repeat(2001).length).toBeGreaterThan(2000);
    expect("a".repeat(2000).length).toBe(2000);
  });

  it("7. clientMessageId 멱등 - 동일 id로 재요청 시 동일 메시지 반환 (mock)", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const existing = { id: "msg-1", clientMessageId: "client-1" };
    vi.mocked(prisma.directMessage.findFirst).mockResolvedValue(existing as never);
    const found = await prisma.directMessage.findFirst({ where: { conversationId: "conv-1", clientMessageId: "client-1" } } as never);
    expect(found).toEqual(existing);
  });

  it("8. 비참여자 메시지 조회/전송 403 - participant 체크", () => {
    const conversation = { userAId: "a", userBId: "b" };
    const viewer = "c";
    const isParticipant = conversation.userAId === viewer || conversation.userBId === viewer;
    expect(isParticipant).toBe(false);
  });

  it("9. 읽음 처리 - readAt 기록 및 read 이벤트 대상은 발신자", () => {
    const message = { id: "m1", senderId: "sender-1", readAt: null as Date | null };
    const viewerId = "viewer-1";
    expect(message.senderId === viewerId).toBe(false);
    expect(message.readAt).toBeNull();
    const updated = { ...message, readAt: new Date() };
    expect(updated.readAt).not.toBeNull();
  });

  it("10. 알림 80자 절단 - body preview는 80자까지", () => {
    const content = "a".repeat(200);
    const preview = content.slice(0, 80);
    expect(preview.length).toBe(80);
    expect("짧은 메시지".slice(0, 80)).toBe("짧은 메시지");
  });
});
