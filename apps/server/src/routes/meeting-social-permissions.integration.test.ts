import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meetingParticipant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    meeting: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    meetingJoinRequest: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    friendship: { findMany: vi.fn() },
    poke: { upsert: vi.fn() },
    placeCandidate: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../lib/auth.js", () => ({
  verifyAccessToken: vi.fn(() => ({ sub: "user-1", exp: 9999999999 })),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createAccessToken: vi.fn(),
}));

vi.mock("../lib/notifications.js", () => ({
  createNotification: vi.fn(async () => ({})),
  isQuietTime: vi.fn(() => false),
}));

vi.mock("../realtime/events.js", () => ({
  emitPoke: vi.fn(),
  emitMeetingUpdated: vi.fn(),
  setRealtimeServer: vi.fn(),
  emitNotificationCreated: vi.fn(),
  emitFriendRequestReceived: vi.fn(),
  emitFriendRequestAccepted: vi.fn(),
  emitMeetingInvitationReceived: vi.fn(),
  emitMeetingInvitationResponded: vi.fn(),
  emitMeetingCallIncoming: vi.fn(),
}));

vi.mock("../config/env.js", () => ({
  env: {
    CLIENT_ORIGIN: "*",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-32-chars-long-1234567890",
  },
}));

import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

function startServer() {
  const app = createApp();
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const MEETING_ID = "123e4567-e89b-12d3-a456-426614174000";
const PARTICIPANT_ID = "223e4567-e89b-12d3-a456-426614174001";

describe("PATCH /api/meetings/:meetingId/permissions integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists microphonePermissionGranted:true alongside cameraPermissionGranted:true → 200 and DB row updated", async () => {
    const participant = {
      id: PARTICIPANT_ID,
      meetingId: MEETING_ID,
      userId: "user-1",
      cameraPermissionGranted: false,
      microphonePermissionGranted: false,
      meeting: { id: MEETING_ID, locationShareMode: "OFF", scheduledAt: new Date(), shareMinutesBefore: 10 },
    };
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValue(participant as never);
    vi.mocked(prisma.meetingParticipant.update).mockImplementation(async (args: never) => {
      const a = args as { data: Record<string, boolean>; where: unknown };
      return { id: PARTICIPANT_ID, ...a.data } as never;
    });

    const { url, close } = await startServer();
    try {
      const res = await fetch(`${url}/api/meetings/${MEETING_ID}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fake-token" },
        body: JSON.stringify({ cameraPermissionGranted: true, microphonePermissionGranted: true }),
      });
      const body = await res.json() as { success: boolean; data?: { participant: { cameraPermissionGranted: boolean; microphonePermissionGranted: boolean } }; error?: { code: string } };
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // assert prisma.update called with both flags true (real DB-persisted value check via mock)
      const updateCall = vi.mocked(prisma.meetingParticipant.update).mock.calls[0]?.[0] as { data: Record<string, boolean> } | undefined;
      expect(updateCall).toBeDefined();
      expect(updateCall!.data.cameraPermissionGranted).toBe(true);
      expect(updateCall!.data.microphonePermissionGranted).toBe(true);
      // also response participant reflects true
      expect(body.data?.participant.microphonePermissionGranted).toBe(true);
      expect(body.data?.participant.cameraPermissionGranted).toBe(true);
    } finally {
      await close();
    }
  });

  it("invalid type (string instead of boolean) returns 400 with VALIDATION_ERROR", async () => {
    const participant = {
      id: PARTICIPANT_ID,
      meetingId: MEETING_ID,
      userId: "user-1",
      meeting: { id: MEETING_ID, locationShareMode: "OFF", scheduledAt: new Date(), shareMinutesBefore: 10 },
    };
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValue(participant as never);

    const { url, close } = await startServer();
    try {
      const res = await fetch(`${url}/api/meetings/${MEETING_ID}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fake-token" },
        body: JSON.stringify({ cameraPermissionGranted: true, microphonePermissionGranted: "true" }),
      });
      const body = await res.json() as { success: boolean; error?: { code: string } };
      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
      expect(vi.mocked(prisma.meetingParticipant.update)).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("invalid camera type string returns 400", async () => {
    const participant = {
      id: PARTICIPANT_ID,
      meetingId: MEETING_ID,
      userId: "user-1",
      meeting: { id: MEETING_ID, locationShareMode: "OFF", scheduledAt: new Date(), shareMinutesBefore: 10 },
    };
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValue(participant as never);
    const { url, close } = await startServer();
    try {
      const res = await fetch(`${url}/api/meetings/${MEETING_ID}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fake-token" },
        body: JSON.stringify({ cameraPermissionGranted: "yes" }),
      });
      const body = await res.json() as { success: boolean; error?: { code: string } };
      expect(res.status).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    } finally {
      await close();
    }
  });

  it("backward compatible: single cameraPermissionGranted still persists → 200", async () => {
    const participant = {
      id: PARTICIPANT_ID,
      meetingId: MEETING_ID,
      userId: "user-1",
      meeting: { id: MEETING_ID, locationShareMode: "OFF", scheduledAt: new Date(), shareMinutesBefore: 10 },
    };
    vi.mocked(prisma.meetingParticipant.findUnique).mockResolvedValue(participant as never);
    vi.mocked(prisma.meetingParticipant.update).mockImplementation(async (args: never) => {
      const a = args as { data: Record<string, boolean> };
      return { id: PARTICIPANT_ID, ...a.data } as never;
    });
    const { url, close } = await startServer();
    try {
      const res = await fetch(`${url}/api/meetings/${MEETING_ID}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fake-token" },
        body: JSON.stringify({ cameraPermissionGranted: true }),
      });
      const body = await res.json() as { success: boolean; data?: { participant: { cameraPermissionGranted: boolean } } };
      expect(res.status).toBe(200);
      expect(body.data?.participant.cameraPermissionGranted).toBe(true);
      const updateCall = vi.mocked(prisma.meetingParticipant.update).mock.calls[0]?.[0] as { data: Record<string, boolean> };
      expect(updateCall.data.cameraPermissionGranted).toBe(true);
      expect(updateCall.data.microphonePermissionGranted).toBeUndefined();
    } finally {
      await close();
    }
  });
});
