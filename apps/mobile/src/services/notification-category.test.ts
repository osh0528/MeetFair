import { describe, expect, it } from "vitest";
import { getNotificationCategory } from "./notification-category";

describe("notification categories", () => {
  it("separates direct messages, every poke type, and meeting notifications", () => {
    expect(getNotificationCategory("DIRECT_MESSAGE")).toBe("DIRECT_MESSAGE");
    expect(getNotificationCategory("CASUAL_POKE")).toBe("POKE");
    expect(getNotificationCategory("MEETING_POKE")).toBe("POKE");
    expect(getNotificationCategory("AUTOMATIC_MEETING_POKE")).toBe("POKE");
    expect(getNotificationCategory("MEETING_INVITATION")).toBe("MEETING");
    expect(getNotificationCategory("MEETING_CALL_INCOMING")).toBe("MEETING");
  });

  it("keeps unrelated notifications available as other", () => {
    expect(getNotificationCategory("FRIEND_REQUEST")).toBe("OTHER");
    expect(getNotificationCategory("PROFILE_GUESTBOOK")).toBe("OTHER");
  });
});
