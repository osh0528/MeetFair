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

async function sendExpoPush(
  userId: string,
  notificationType: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { expoPushToken: true },
  });
  if (!tokens.length) return;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.EXPO_PUSH_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const isPoke = notificationType === "CASUAL_POKE"
      || notificationType === "MEETING_POKE"
      || notificationType === "AUTOMATIC_MEETING_POKE";
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(tokens.map(({ expoPushToken }) => ({
        to: expoPushToken,
        sound: "default",
        ...(isPoke ? { channelId: "pokes-v3", priority: "high" } : {}),
        title,
        body,
        data: { ...data, notificationType },
      }))),
    });
    if (!response.ok) {
      console.error(`Expo push request failed with status ${response.status}`);
      return;
    }
    const result = await response.json() as {
      data?: Array<{ status?: string; message?: string; details?: { error?: string } }>;
    };
    const invalidTokens = tokens.flatMap((token, index) => (
      result.data?.[index]?.details?.error === "DeviceNotRegistered" ? [token.expoPushToken] : []
    ));
    if (invalidTokens.length) {
      await prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: invalidTokens } } });
    }
    const failedTickets = result.data?.filter((ticket) => ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered") ?? [];
    if (failedTickets.length) console.error("Expo push tickets failed", failedTickets);
  } catch (error) {
    console.error("Expo push request failed", error);
  } finally {
    clearTimeout(timeout);
  }
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
    await sendExpoPush(input.userId, input.type, input.title, input.body, input.data ?? {});
  }
  return summary;
}

