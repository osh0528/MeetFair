import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function registerRealtimeHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== "string") throw new Error("missing token");
      socket.data.userId = verifyAccessToken(token).sub;
      next();
    } catch {
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const currentUserId = socket.data.userId as string;
    void socket.join(`user:${currentUserId}`);

    socket.on("meeting:join", async ({ meetingId }) => {
      const participant = await prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId, userId: currentUserId } },
      });
      if (!participant) {
        socket.emit("meeting:error", { code: "NOT_A_PARTICIPANT", message: "You are not a participant of this meeting." });
        return;
      }
      await socket.join(meetingRoom(meetingId));
    });

    socket.on("location:update", async (payload) => {
      if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || !Number.isFinite(payload.accuracy) || payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
        socket.emit("meeting:error", { code: "INVALID_LOCATION", message: "Location data is invalid." });
        return;
      }
      const participant = await prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId: payload.meetingId, userId: currentUserId } },
        include: {
          user: { select: { nickname: true } },
          meeting: { include: { confirmedPlace: true } },
        },
      });
      if (!participant || !participant.locationConsent || participant.sharingStatus !== "SHARING") {
        socket.emit("meeting:error", { code: "LOCATION_NOT_ALLOWED", message: "Location sharing is not enabled." });
        return;
      }
      const capturedAt = new Date(payload.sentAt);
      if (Number.isNaN(capturedAt.getTime()) || Math.abs(Date.now() - capturedAt.getTime()) > 10 * 60 * 1000) {
        socket.emit("meeting:error", { code: "INVALID_LOCATION_TIME", message: "Location timestamp is invalid." });
        return;
      }
      const place = participant.meeting.confirmedPlace;
      const nearDestination = place
        ? distanceMeters(payload.latitude, payload.longitude, place.latitude, place.longitude) <= 100
        : false;
      const proximityCount = nearDestination ? participant.arrivalProximityCount + 1 : 0;
      const arrived = proximityCount >= 2;
      await prisma.$transaction([
        prisma.locationSample.create({
          data: {
            participantId: participant.id,
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            capturedAt,
          },
        }),
        prisma.meetingParticipant.update({
          where: { id: participant.id },
          data: {
            lastLatitude: payload.latitude,
            lastLongitude: payload.longitude,
            lastAccuracy: payload.accuracy,
            lastLocationAt: capturedAt,
            arrivalProximityCount: proximityCount,
            arrivedAt: arrived ? new Date() : undefined,
            sharingStatus: arrived ? "ARRIVED" : undefined,
            locationConsent: arrived ? false : undefined,
          },
        }),
      ]);
      socket.to(meetingRoom(payload.meetingId)).emit("participant:location", { ...payload, userId: currentUserId, nickname: participant.user.nickname });
      if (arrived) {
        io.to(meetingRoom(payload.meetingId)).emit("participant:status", {
          meetingId: payload.meetingId,
          userId: currentUserId,
          status: "ARRIVED",
        });
        io.to(meetingRoom(payload.meetingId)).emit("meeting:updated", {
          meetingId: payload.meetingId,
          reason: "ARRIVAL",
        });
      }
    });

    socket.on("sharing:status", async (payload) => {
      if (!(["NOT_STARTED", "SHARING", "PAUSED", "ARRIVED"] as const).includes(payload.status)) {
        socket.emit("meeting:error", { code: "INVALID_SHARING_STATUS", message: "Sharing status is invalid." });
        return;
      }
      const participant = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: payload.meetingId, userId: currentUserId } } });
      if (!participant || (payload.status === "SHARING" && !participant.locationConsent)) {
        socket.emit("meeting:error", { code: "SHARING_NOT_ALLOWED", message: "Location sharing has not been approved." });
        return;
      }
      await prisma.meetingParticipant.update({ where: { id: participant.id }, data: { sharingStatus: payload.status } });
      socket.to(meetingRoom(payload.meetingId)).emit("participant:status", { ...payload, userId: currentUserId });
    });
  });
}
