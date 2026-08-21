import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { friendsRouter } from "./routes/friends.js";
import { meetingInvitationsRouter } from "./routes/meeting-invitations.js";
import { meetingsRouter } from "./routes/meetings.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN === "*" ? true : env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/friends", friendsRouter);
  app.use("/api/meeting-invitations", meetingInvitationsRouter);
  app.use("/api/meetings", meetingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
