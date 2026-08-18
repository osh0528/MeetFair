import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { registerRealtimeHandlers } from "./realtime/register-handlers.js";

const app = createApp();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: env.CLIENT_ORIGIN === "*" ? true : env.CLIENT_ORIGIN,
    credentials: true,
  },
});

registerRealtimeHandlers(io);

httpServer.listen(env.PORT, () => {
  console.log(`MeetFair server listening on http://localhost:${env.PORT}`);
});
