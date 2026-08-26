import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@meetfair/shared";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { registerRealtimeHandlers } from "./realtime/register-handlers.js";
import { setRealtimeServer } from "./realtime/events.js";
import { processDueMeetingCalls } from "./services/meeting-calls.js";
import { processMeetingLifecycle } from "./services/meetings.js";
import { processQuietSummaries } from "./services/poke-summaries.js";
import { processCallRecordingRetention } from "./services/call-recordings.js";

const app = createApp();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: env.CLIENT_ORIGIN === "*" ? true : env.CLIENT_ORIGIN,
    credentials: true,
  },
});

registerRealtimeHandlers(io);
setRealtimeServer(io);

const lifecycleTimer = setInterval(() => {
  void processDueMeetingCalls().catch((error) => {
    console.error("Meeting call scheduler failed", error);
  });
  void processMeetingLifecycle().catch((error) => {
    console.error("Meeting lifecycle scheduler failed", error);
  });
  void processQuietSummaries().catch((error) => {
    console.error("Quiet summary scheduler failed", error);
  });
  void processCallRecordingRetention().catch((error) => {
    console.error("Call recording retention scheduler failed", error);
  });
}, 15_000);
lifecycleTimer.unref();
void processDueMeetingCalls();
void processMeetingLifecycle();
void processQuietSummaries();
void processCallRecordingRetention();

httpServer.listen(env.PORT, () => {
  console.log(`MeetFair server listening on http://localhost:${env.PORT}`);
});
