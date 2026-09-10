import type { NotificationSummary } from "@meetfair/shared";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { emitNotificationCreated } from "../realtime/events.js";
import { Prisma } from "../generated/prisma/client.js";
import { pushRequest } from "./push-request.js";
import { classifyExpoPushTickets, type ExpoPushTicket } from "./expo-push-tickets.js";

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
  const storedTokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { expoPushToken: true },
  });
  // Legacy clients could store a native FCM token here. It must not invalidate the Expo batch.
  const tokens = storedTokens
    .map(({ expoPushToken }) => expoPushToken)
    .filter((expoPushToken) => /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(expoPushToken));
  if (!tokens.length) return;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.EXPO_PUSH_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const isDirectMessage = notificationType === "DIRECT_MESSAGE";
    const isPoke = notificationType === "CASUAL_POKE"
      || notificationType === "MEETING_POKE"
      || notificationType === "AUTOMATIC_MEETING_POKE";
    let pendingTokens = tokens;
    const invalidTokens = new Set<string>();
    for (let ticketAttempt = 0; pendingTokens.length && ticketAttempt < 3; ticketAttempt += 1) {
      const response = await pushRequest("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify(pendingTokens.map((expoPushToken) => ({
          to: expoPushToken,
          sound: "default",
          priority: "high",
          ...(!isPoke && !isDirectMessage ? { channelId: "meeting-reminders" } : {}),
          ...(isPoke ? { channelId: "pokes-v4", ttl: 300 } : {}),
          ...(isDirectMessage ? { channelId: "direct-messages-v2" } : {}),
          title,
          body,
          data: { ...data, notificationType },
        }))),
      });
      if (!response.ok) {
        console.error(`Expo push request failed with status ${response.status}`);
        return;
      }
      const result = await response.json() as { data?: ExpoPushTicket[] };
      const classified = classifyExpoPushTickets(pendingTokens, result.data);
      classified.invalidTokens.forEach((token) => invalidTokens.add(token));
      if (classified.failedTickets.length) console.error("Expo push tickets failed", classified.failedTickets);
      pendingTokens = classified.retryTokens;
      if (pendingTokens.length && ticketAttempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** ticketAttempt));
      }
    }
    if (invalidTokens.size) {
      await prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: [...invalidTokens] } } });
    }
    if (pendingTokens.length) console.error("Expo push tickets remained rate limited after retries", pendingTokens.length);
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

