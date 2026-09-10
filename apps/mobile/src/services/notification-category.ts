import type { NotificationSummary } from "@meetfair/shared";

export type NotificationCategory = "ALL" | "DIRECT_MESSAGE" | "POKE" | "MEETING";
export type NotificationItemCategory = Exclude<NotificationCategory, "ALL"> | "OTHER";

export const NOTIFICATION_CATEGORIES: Array<{ key: NotificationCategory; label: string }> = [
  { key: "ALL", label: "전체" },
  { key: "DIRECT_MESSAGE", label: "개인 DM" },
  { key: "POKE", label: "찌르기" },
  { key: "MEETING", label: "모임" },
];

export function getNotificationCategory(type: string): NotificationItemCategory {
  if (type === "DIRECT_MESSAGE") return "DIRECT_MESSAGE";
  if (type.includes("POKE")) return "POKE";
  if (type.startsWith("MEETING_")) return "MEETING";
  return "OTHER";
}

export function notificationMatchesCategory(
  notification: NotificationSummary,
  category: NotificationCategory,
) {
  return category === "ALL" || getNotificationCategory(notification.type) === category;
}

export function getNotificationCategoryLabel(type: string) {
  const category = getNotificationCategory(type);
  if (category === "DIRECT_MESSAGE") return "개인 DM";
  if (category === "POKE") return "찌르기";
  if (category === "MEETING") return "모임";
  return "기타";
}
