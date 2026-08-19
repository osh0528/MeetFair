import type { Server } from "socket.io";
import type { PokeReceivedPayload, ClientToServerEvents, ServerToClientEvents } from "@meetfair/shared";

let realtimeServer: Server<ClientToServerEvents, ServerToClientEvents> | undefined;

export function setRealtimeServer(server: Server<ClientToServerEvents, ServerToClientEvents>) {
  realtimeServer = server;
}

export function emitPoke(targetUserId: string, payload: PokeReceivedPayload) {
  realtimeServer?.to(`user:${targetUserId}`).emit("poke:received", payload);
}
