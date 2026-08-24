import type { NotificationSummary } from "@meetfair/shared";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { emitNotificationCreated } from "../realtime/events.js";
import { Prisma } from "../generated/prisma/client.js";

export { isQuietTime, lastEndedQuietWindow } from "./quiet-time.js";

function toSummary(notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationSummary {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: (notification.data as Record<string, unknown> | null) ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

async function sendExpoPush(userId: string, title: string, body: string, data: Record<string, unknown>) {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { expoPushToken: true },
  });
  if (!tokens.length) return;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.EXPO_PUSH_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify(tokens.map(({ expoPushToken }) => ({
      to: expoPushToken,
      sound: "default",
      title,
      body,
      data,
    }))),
  }).catch(() => undefined);
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  push?: boolean;
  /** Important notifications bypass quiet hours and always attempt an immediate push. */
  important?: boolean;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data as Prisma.InputJsonValue | undefined,
    },
  });
  const summary = toSummary(notification);
  emitNotificationCreated(input.userId, { notification: summary });
  const shouldPush = input.important === true ? true : input.push !== false;
  if (shouldPush) {
    await sendExpoPush(input.userId, input.title, input.body, input.data ?? {});
  }
  return summary;
}

