import cors from "cors";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { friendsRouter } from "./routes/friends.js";
import { meetingInvitationsRouter } from "./routes/meeting-invitations.js";
import { meetingsRouter, recommendationsRouter } from "./routes/meetings.js";
import { usersRouter } from "./routes/users.js";
import { notificationsRouter } from "./routes/notifications.js";
import { pokesRouter } from "./routes/pokes.js";
import { meetingSocialRouter } from "./routes/meeting-social.js";
import { meetingCallsRouter } from "./routes/meeting-calls.js";

export function createApp() {
  const app = express();

  // Vercel's Express compiler resolves Helmet's CJS declaration as a module
  // namespace even though its ESM default export is the middleware factory.
  app.use((helmet as unknown as () => RequestHandler)());
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
  app.use("/api/meetings", meetingSocialRouter);
  app.use("/api/meetings", meetingsRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/pokes", pokesRouter);
  app.use("/api/meeting-calls", meetingCallsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
