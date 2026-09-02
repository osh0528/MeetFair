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

async function processRecordingAndMeetingLifecycle() {
  await processCallRecordingRetention().catch((error) => {
    console.error("Call recording retention scheduler failed", error);
  });
  await processMeetingLifecycle().catch((error) => {
    console.error("Meeting lifecycle scheduler failed", error);
  });
}

const lifecycleTimer = setInterval(() => {
  void processDueMeetingCalls().catch((error) => {
    console.error("Meeting call scheduler failed", error);
  });
  void processRecordingAndMeetingLifecycle();
  void processQuietSummaries().catch((error) => {
    console.error("Quiet summary scheduler failed", error);
  });
}, 15_000);
lifecycleTimer.unref();
void processDueMeetingCalls();
void processQuietSummaries();
void processRecordingAndMeetingLifecycle();

httpServer.listen(env.PORT, "0.0.0.0", () => {
  console.log(`MeetFair server listening on http://0.0.0.0:${env.PORT} (LAN: http://172.30.1.173:${env.PORT})`);
});
