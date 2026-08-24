import type { NotificationSummary } from "@meetfair/shared";
import { prisma } from "./prisma.js";
import { emitNotificationCreated } from "../realtime/events.js";
import { Prisma } from "../generated/prisma/client.js";

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
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  if (input.push !== false) {
    await sendExpoPush(input.userId, input.title, input.body, input.data ?? {});
  }
  return summary;
}

export function isQuietTime(start: number | null, end: number | null, timezone: string) {
  if (start === null || end === null) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const now = hour * 60 + minute;
  return start <= end ? now >= start && now < end : now >= start || now < end;
}
