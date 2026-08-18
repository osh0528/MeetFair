import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import { io, type Socket } from "socket.io-client";
import { appConfig } from "../config/env";

export function createMeetingSocket(
  accessToken: string,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(appConfig.socketUrl, {
    autoConnect: false,
    auth: {
      token: accessToken,
    },
  });
}
