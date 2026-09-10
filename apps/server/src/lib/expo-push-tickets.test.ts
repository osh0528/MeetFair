import { describe, expect, it } from "vitest";
import { classifyExpoPushTickets } from "./expo-push-tickets.js";

describe("Expo push ticket classification", () => {
  it("retries rate-limited and missing tickets without resending successful ones", () => {
    expect(classifyExpoPushTickets(
      ["success", "rate-limited", "missing"],
      [
        { status: "ok" },
        { status: "error", details: { error: "MessageRateExceeded" } },
      ],
    )).toEqual({
      invalidTokens: [],
      retryTokens: ["rate-limited", "missing"],
      failedTickets: [],
    });
  });

  it("separates expired tokens from permanent ticket failures", () => {
    expect(classifyExpoPushTickets(
      ["expired", "credentials"],
      [
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "credentials", details: { error: "InvalidCredentials" } },
      ],
    )).toEqual({
      invalidTokens: ["expired"],
      retryTokens: [],
      failedTickets: [
        { status: "error", message: "credentials", details: { error: "InvalidCredentials" } },
      ],
    });
  });
});
