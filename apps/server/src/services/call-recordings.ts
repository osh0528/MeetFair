import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  RoomServiceClient,
  S3Upload,
} from "livekit-server-sdk";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { emitMeetingChatReceived } from "../realtime/events.js";

export const CALL_RECORDING_RETENTION_MS = 24 * 60 * 60 * 1000;
const RECORDING_PLAYBACK_URL_TTL_SECONDS = 15 * 60;

function recordingConfig() {
  if (
    !env.LIVEKIT_URL
    || !env.LIVEKIT_API_KEY
    || !env.LIVEKIT_API_SECRET
    || !env.RECORDING_S3_BUCKET
    || !env.RECORDING_S3_ACCESS_KEY
    || !env.RECORDING_S3_SECRET_KEY
  ) return null;
  return {
    livekitUrl: env.LIVEKIT_URL,
    livekitHttpUrl: env.LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:"),
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    endpoint: env.RECORDING_S3_ENDPOINT,
    region: env.RECORDING_S3_REGION,
    bucket: env.RECORDING_S3_BUCKET,
    accessKey: env.RECORDING_S3_ACCESS_KEY,
    secretKey: env.RECORDING_S3_SECRET_KEY,
    forcePathStyle: env.RECORDING_S3_FORCE_PATH_STYLE,
  };
}

export function callRecordingConfigured() {
  return recordingConfig() !== null;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function waitForRecordingStart(callId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const call = await prisma.meetingCall.findUnique({
      where: { id: callId },
      select: { recordingStatus: true, recordingError: true },
    });
    if (call?.recordingStatus === "RECORDING") return;
    if (call?.recordingStatus === "FAILED") {
      throw new Error(call.recordingError || "Call recording failed to start.");
    }
  }
  throw new Error("Call recording start timed out.");
}

export async function ensureCallRecording(callId: string, roomName: string) {
  const config = recordingConfig();
  if (!config) throw new Error("Call recording storage is not configured.");

  const existing = await prisma.meetingCall.findUnique({
    where: { id: callId },
    select: { recordingStatus: true },
  });
  if (existing?.recordingStatus === "RECORDING" || existing?.recordingStatus === "STORED") return;
  if (existing?.recordingStatus === "STARTING") {
    await waitForRecordingStart(callId);
    return;
  }

  const objectKey = `meeting-call-recordings/${callId}.mp4`;
  const claim = await prisma.meetingCall.updateMany({
    where: { id: callId, recordingStatus: { in: ["PENDING", "FAILED"] } },
    data: {
      recordingStatus: "STARTING",
      recordingObjectKey: objectKey,
      recordingStartedAt: new Date(),
      recordingError: null,
    },
  });
  if (!claim.count) {
    await waitForRecordingStart(callId);
    return;
  }

  try {
    const roomClient = new RoomServiceClient(config.livekitHttpUrl, config.apiKey, config.apiSecret);
    const rooms = await roomClient.listRooms([roomName]);
    if (!rooms.length) {
      await roomClient.createRoom({ name: roomName, emptyTimeout: 60, departureTimeout: 30 });
    }

    const egressClient = new EgressClient(config.livekitHttpUrl, config.apiKey, config.apiSecret);
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: objectKey,
      disableManifest: true,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: config.accessKey,
          secret: config.secretKey,
          region: config.region,
          endpoint: config.endpoint ?? "",
          bucket: config.bucket,
          forcePathStyle: config.forcePathStyle,
        }),
      },
    });
    const egress = await egressClient.startRoomCompositeEgress(roomName, output, {
      layout: "grid",
      audioOnly: false,
      videoOnly: false,
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    });
    await prisma.meetingCall.update({
      where: { id: callId },
      data: { recordingStatus: "RECORDING", recordingEgressId: egress.egressId },
    });
  } catch (error) {
    await prisma.meetingCall.update({
      where: { id: callId },
      data: { recordingStatus: "FAILED", recordingError: errorMessage(error) },
    });
    throw error;
  }
}

export async function stopCallRecording(callId: string, endedAt = new Date()) {
  const config = recordingConfig();
  const call = await prisma.meetingCall.findUnique({
    where: { id: callId },
    select: {
      recordingStatus: true,
      recordingEgressId: true,
      meetingId: true,
      meeting: { select: { hostId: true, scheduledAt: true } },
    },
  });
  if (!call || call.recordingStatus !== "RECORDING" || !call.recordingEgressId || !config) return;

  const claim = await prisma.meetingCall.updateMany({
    where: { id: callId, recordingStatus: "RECORDING" },
    data: { recordingStatus: "STOPPING", recordingError: null },
  });
  if (!claim.count) return;

  let finalStatus = "STORED";
  try {
    const egressClient = new EgressClient(config.livekitHttpUrl, config.apiKey, config.apiSecret);
    try {
      await egressClient.stopEgress(call.recordingEgressId);
    } catch (stopError) {
      const [egress] = await egressClient.listEgress({ egressId: call.recordingEgressId });
      if (!egress || ![
        EgressStatus.EGRESS_COMPLETE,
        EgressStatus.EGRESS_FAILED,
        EgressStatus.EGRESS_ABORTED,
      ].includes(egress.status)) throw stopError;
      if (egress.status !== EgressStatus.EGRESS_COMPLETE) finalStatus = "FAILED";
    }
    await prisma.meetingCall.update({
      where: { id: callId },
      data: {
        recordingStatus: finalStatus,
        recordingEndedAt: endedAt,
        recordingExpiresAt: new Date(call.meeting.scheduledAt.getTime() + CALL_RECORDING_RETENTION_MS),
      },
    });
    if (finalStatus === "STORED") {
      await publishRecordingToChat({
        callId,
        meetingId: call.meetingId,
        senderId: call.meeting.hostId,
      }).catch(async (error) => {
        await prisma.meetingCall.update({
          where: { id: callId },
          data: { recordingError: errorMessage(error) },
        });
        console.error("Stored call recording could not be published to meeting chat", error);
      });
    }
  } catch (error) {
    await prisma.meetingCall.update({
      where: { id: callId },
      data: { recordingStatus: "RECORDING", recordingError: errorMessage(error) },
    });
    throw error;
  }
}

async function publishRecordingToChat(input: { callId: string; meetingId: string; senderId: string }) {
  const message = await prisma.meetingChatMessage.upsert({
    where: { callId: input.callId },
    create: {
      meetingId: input.meetingId,
      senderId: input.senderId,
      content: "모임 통화 녹화 영상",
      messageType: "VIDEO",
      callId: input.callId,
    },
    update: {},
  });
  emitMeetingChatReceived(input.meetingId, {
    message: {
      id: message.id,
      meetingId: message.meetingId,
      senderId: message.senderId,
      content: message.content,
      messageType: "VIDEO",
      callId: message.callId,
      createdAt: message.createdAt.toISOString(),
      deletedAt: message.deletedAt?.toISOString() ?? null,
    },
  });
}

function s3Client() {
  const config = recordingConfig();
  if (!config) return null;
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    }),
  };
}

export async function createCallRecordingPlaybackUrl(callId: string, now = new Date()) {
  const storage = s3Client();
  if (!storage) throw new Error("Call recording storage is not configured.");
  const call = await prisma.meetingCall.findUnique({
    where: { id: callId },
    select: {
      recordingStatus: true,
      recordingObjectKey: true,
      recordingExpiresAt: true,
      recordingDeletedAt: true,
    },
  });
  if (
    !call
    || call.recordingStatus !== "STORED"
    || !call.recordingObjectKey
    || call.recordingDeletedAt
    || !call.recordingExpiresAt
    || call.recordingExpiresAt <= now
  ) return null;
  return getSignedUrl(
    storage.client,
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: call.recordingObjectKey,
      ResponseContentDisposition: "inline",
      ResponseContentType: "video/mp4",
    }),
    { expiresIn: RECORDING_PLAYBACK_URL_TTL_SECONDS },
  );
}

export async function deleteMeetingRecordingObjects(meetingId: string, now = new Date()) {
  const calls = await prisma.meetingCall.findMany({
    where: { meetingId, recordingObjectKey: { not: null }, recordingDeletedAt: null },
    select: { id: true, recordingObjectKey: true },
  });
  if (!calls.length) return true;
  const storage = s3Client();
  if (!storage) return false;
  for (const call of calls) {
    if (!call.recordingObjectKey) continue;
    try {
      await storage.client.send(new DeleteObjectCommand({
        Bucket: storage.bucket,
        Key: call.recordingObjectKey,
      }));
      await prisma.meetingCall.update({
        where: { id: call.id },
        data: { recordingStatus: "DELETED", recordingDeletedAt: now, recordingError: null },
      });
    } catch (error) {
      await prisma.meetingCall.update({
        where: { id: call.id },
        data: {
          recordingError: errorMessage(error),
          recordingDeleteAttempts: { increment: 1 },
        },
      });
      return false;
    }
  }
  return true;
}

export async function processCallRecordingRetention(now = new Date()) {
  await prisma.meetingCall.updateMany({
    where: {
      recordingStatus: "STARTING",
      recordingStartedAt: { lte: new Date(now.getTime() - 5 * 60_000) },
    },
    data: { recordingStatus: "FAILED", recordingError: "Recording start was interrupted." },
  });

  const endedRecordings = await prisma.meetingCall.findMany({
    where: { status: "ENDED", recordingStatus: "RECORDING", recordingEgressId: { not: null } },
    select: { id: true, endedAt: true },
    take: 20,
  });
  for (const call of endedRecordings) {
    await stopCallRecording(call.id, call.endedAt ?? now).catch(() => undefined);
  }

  const unpublishedRecordings = await prisma.meetingCall.findMany({
    where: {
      recordingStatus: "STORED",
      recordingDeletedAt: null,
      recordingMessage: { is: null },
    },
    select: { id: true, meetingId: true, meeting: { select: { hostId: true } } },
    take: 20,
  });
  for (const call of unpublishedRecordings) {
    await publishRecordingToChat({
      callId: call.id,
      meetingId: call.meetingId,
      senderId: call.meeting.hostId,
    }).catch(() => undefined);
  }

  const storage = s3Client();
  if (!storage) return;
  const expired = await prisma.meetingCall.findMany({
    where: {
      recordingStatus: { in: ["STORED", "FAILED"] },
      recordingExpiresAt: { lte: now },
      recordingDeletedAt: null,
      recordingObjectKey: { not: null },
    },
    select: { id: true, recordingObjectKey: true },
    take: 20,
  });
  for (const call of expired) {
    if (!call.recordingObjectKey) continue;
    try {
      await storage.client.send(new DeleteObjectCommand({
        Bucket: storage.bucket,
        Key: call.recordingObjectKey,
      }));
      await prisma.meetingCall.update({
        where: { id: call.id },
        data: { recordingStatus: "DELETED", recordingDeletedAt: now, recordingError: null },
      });
    } catch (error) {
      await prisma.meetingCall.update({
        where: { id: call.id },
        data: {
          recordingError: errorMessage(error),
          recordingDeleteAttempts: { increment: 1 },
        },
      });
    }
  }
}
