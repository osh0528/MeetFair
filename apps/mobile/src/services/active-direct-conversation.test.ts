import { afterEach, describe, expect, it } from "vitest";
import type { NotificationSummary } from "@meetfair/shared";
import {
  setActiveDirectConversationId,
  shouldShowWebNotification,
} from "./active-direct-conversation";

function notification(type: string, conversationId?: string): NotificationSummary {
  return {
    id: "notification-1",
    type,
    title: "title",
    body: "body",
    data: conversationId ? { conversationId } : null,
    readAt: null,
    createdAt: new Date(0).toISOString(),
  };
}

describe("web notification visibility", () => {
  afterEach(() => setActiveDirectConversationId(null));

  it("hides a direct message for the conversation currently open on PC", () => {
    setActiveDirectConversationId("conversation-1");
    expect(shouldShowWebNotification(notification("DIRECT_MESSAGE", "conversation-1"))).toBe(false);
  });

  it("keeps other direct messages and notification types visible", () => {
    setActiveDirectConversationId("conversation-1");
    expect(shouldShowWebNotification(notification("DIRECT_MESSAGE", "conversation-2"))).toBe(true);
    expect(shouldShowWebNotification(notification("MEETING_POKE", "conversation-1"))).toBe(true);
  });
});
