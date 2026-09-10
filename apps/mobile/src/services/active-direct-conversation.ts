import type { NotificationSummary } from "@meetfair/shared";

let activeConversationId: string | null = null;

export function setActiveDirectConversationId(conversationId: string | null) {
  activeConversationId = conversationId;
}

export function clearActiveDirectConversationId(conversationId: string | null) {
  if (activeConversationId === conversationId) activeConversationId = null;
}

export function shouldShowWebNotification(notification: NotificationSummary) {
  if (notification.type !== "DIRECT_MESSAGE" || !activeConversationId) return true;
  const notificationConversationId = notification.data?.conversationId;
  return typeof notificationConversationId !== "string"
    || notificationConversationId !== activeConversationId;
}
