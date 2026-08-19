import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/auth.js";

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

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
        include: { user: { select: { nickname: true } } },
      });
      if (!participant || !participant.locationConsent || participant.sharingStatus !== "SHARING") {
        socket.emit("meeting:error", { code: "LOCATION_NOT_ALLOWED", message: "Location sharing is not enabled." });
        return;
      }
      socket.to(meetingRoom(payload.meetingId)).emit("participant:location", { ...payload, userId: currentUserId, nickname: participant.user.nickname });
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
