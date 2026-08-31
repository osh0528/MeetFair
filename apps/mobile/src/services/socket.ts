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

export function waitForSocketConnection(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  timeoutMs = 8000,
): Promise<void> {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("실시간 서버 연결 시간이 초과되었습니다."));
    }, timeoutMs);
    const handleConnect = () => {
      cleanup();
      resolve();
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(new Error(`실시간 서버에 연결하지 못했습니다: ${error.message}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleError);
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleError);
    socket.connect();
  });
}
