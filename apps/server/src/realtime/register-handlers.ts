import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import type { Server } from "socket.io";

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

export function registerRealtimeHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
) {
  io.on("connection", (socket) => {
    socket.on("meeting:join", ({ meetingId }) => {
      void socket.join(meetingRoom(meetingId));
    });
  });
}
