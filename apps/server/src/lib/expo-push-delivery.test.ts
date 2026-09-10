import { describe, expect, it } from "vitest";
import { expoPushDeliveryOptions } from "./expo-push-delivery.js";

describe("Expo push delivery options", () => {
  it("uses the stable installed channel and a doze-safe TTL for every poke", () => {
    for (const type of ["CASUAL_POKE", "MEETING_POKE", "AUTOMATIC_MEETING_POKE"]) {
      expect(expoPushDeliveryOptions(type)).toEqual({
        channelId: "meeting-reminders",
        ttl: 86_400,
      });
    }
  });

  it("keeps direct messages and meeting notifications on their channels", () => {
    expect(expoPushDeliveryOptions("DIRECT_MESSAGE")).toEqual({ channelId: "direct-messages-v2" });
    expect(expoPushDeliveryOptions("MEETING_INVITATION")).toEqual({ channelId: "meeting-reminders" });
  });
});
