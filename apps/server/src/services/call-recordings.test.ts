import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteObject: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(public input: { Bucket: string; Key: string }) {}
  },
  S3Client: class S3Client {
    send = mocks.deleteObject;
  },
}));

vi.mock("livekit-server-sdk", () => ({
  EgressClient: class EgressClient {},
  RoomServiceClient: class RoomServiceClient {},
  EncodedFileOutput: class EncodedFileOutput {},
  S3Upload: class S3Upload {},
  EncodedFileType: { MP4: 1 },
  EncodingOptionsPreset: { H264_720P_30: 0 },
  EgressStatus: { EGRESS_COMPLETE: 3, EGRESS_FAILED: 4, EGRESS_ABORTED: 5 },
}));

vi.mock("../config/env.js", () => ({
  env: {
    LIVEKIT_URL: "wss://test.livekit.cloud",
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    RECORDING_S3_ENDPOINT: "https://storage.example.com",
    RECORDING_S3_REGION: "auto",
    RECORDING_S3_BUCKET: "recordings",
    RECORDING_S3_ACCESS_KEY: "access",
    RECORDING_S3_SECRET_KEY: "secret",
    RECORDING_S3_FORCE_PATH_STYLE: false,
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meetingCall: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("call recording retention", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps recordings for exactly 24 hours", async () => {
    const { CALL_RECORDING_RETENTION_MS } = await import("./call-recordings.js");
    expect(CALL_RECORDING_RETENTION_MS).toBe(86_400_000);
  });

  it("deletes an expired recording and marks it deleted", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processCallRecordingRetention } = await import("./call-recordings.js");
    vi.mocked(prisma.meetingCall.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.meetingCall.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "call-1", recordingObjectKey: "meeting-call-recordings/call-1.mp4" },
      ] as never);
    mocks.deleteObject.mockResolvedValue({});

    const now = new Date("2026-08-26T05:00:00.000Z");
    await processCallRecordingRetention(now);

    expect(mocks.deleteObject).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.meetingCall.update)).toHaveBeenCalledWith({
      where: { id: "call-1" },
      data: { recordingStatus: "DELETED", recordingDeletedAt: now, recordingError: null },
    });
  });

  it("keeps an expired recording pending when storage deletion fails", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { processCallRecordingRetention } = await import("./call-recordings.js");
    vi.mocked(prisma.meetingCall.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.meetingCall.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "call-2", recordingObjectKey: "meeting-call-recordings/call-2.mp4" },
      ] as never);
    mocks.deleteObject.mockRejectedValue(new Error("storage unavailable"));

    await processCallRecordingRetention(new Date("2026-08-26T05:00:00.000Z"));

    expect(vi.mocked(prisma.meetingCall.update)).toHaveBeenCalledWith({
      where: { id: "call-2" },
      data: { recordingError: "storage unavailable" },
    });
  });
});
