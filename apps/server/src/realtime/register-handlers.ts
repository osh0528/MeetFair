import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";
import { canStartSharing } from "../lib/share-window.js";
import { ARRIVAL_RADIUS_METERS, distanceMeters, nextProximityCount, hasConsecutivelyArrived } from "../lib/geo.js";
import { connectUser, disconnectUser } from "./presence.js";

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

async function notifyFriendsOfPresence(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  userId: string,
  online: boolean,
) {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  for (const friendship of friendships) {
    const friendId = friendship.userAId === userId ? friendship.userBId : friendship.userAId;
    io.to(`user:${friendId}`).emit("friend:presence", { userId, online });
  }
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
    if (connectUser(currentUserId)) {
      void notifyFriendsOfPresence(io, currentUserId, true).catch((error) => {
        console.error("Failed to publish online presence", error);
      });
    }
    socket.on("disconnect", () => {
      if (disconnectUser(currentUserId)) {
        void notifyFriendsOfPresence(io, currentUserId, false).catch((error) => {
          console.error("Failed to publish offline presence", error);
        });
      }
    });

    function runRealtimeTask(task: Promise<void>) {
      void task.catch((error) => {
        console.error("Realtime handler failed", error);
        socket.emit("meeting:error", {
          code: "REALTIME_INTERNAL_ERROR",
          message: "실시간 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      });
    }

    socket.on("meeting:join", ({ meetingId }) => runRealtimeTask((async () => {
      const participant = await prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId, userId: currentUserId } },
      });
      if (!participant) {
        socket.emit("meeting:error", { code: "NOT_A_PARTICIPANT", message: "You are not a participant of this meeting." });
        return;
      }
      await socket.join(meetingRoom(meetingId));
    })()));

    socket.on("location:update", (payload) => runRealtimeTask((async () => {
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
      const shareDecision = canStartSharing(
        { locationShareMode: participant.meeting.locationShareMode, scheduledAt: participant.meeting.scheduledAt, shareMinutesBefore: participant.meeting.shareMinutesBefore },
        new Date(),
      );
      if (!shareDecision.allowed) {
        const code = shareDecision.reason === "SHARE_MODE_OFF" ? "MEETING_LOCATION_SHARE_OFF" : "SHARING_TOO_EARLY";
        socket.emit("meeting:error", { code, message: "Location sharing is not allowed at this time." });
        return;
      }
      const capturedAt = new Date(payload.sentAt);
      if (Number.isNaN(capturedAt.getTime()) || Math.abs(Date.now() - capturedAt.getTime()) > 10 * 60 * 1000) {
        socket.emit("meeting:error", { code: "INVALID_LOCATION_TIME", message: "Location timestamp is invalid." });
        return;
      }
      const place = participant.meeting.confirmedPlace;
      const withinRadius = place
        ? distanceMeters(payload.latitude, payload.longitude, place.latitude, place.longitude) <= ARRIVAL_RADIUS_METERS
        : false;
      const proximityCount = nextProximityCount(participant.arrivalProximityCount, withinRadius);
      const arrived = hasConsecutivelyArrived(proximityCount);
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
    })()));

    socket.on("sharing:status", (payload) => runRealtimeTask((async () => {
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
    })()));
  });
}
