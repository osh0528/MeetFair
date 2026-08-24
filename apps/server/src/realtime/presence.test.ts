import { describe, expect, it } from "vitest";
import { connectUser, disconnectUser, isUserOnline } from "./presence.js";

describe("realtime presence", () => {
  it("stays online until the last socket disconnects", () => {
    const userId = crypto.randomUUID();
    expect(connectUser(userId)).toBe(true);
    expect(connectUser(userId)).toBe(false);
    expect(isUserOnline(userId)).toBe(true);
    expect(disconnectUser(userId)).toBe(false);
    expect(isUserOnline(userId)).toBe(true);
    expect(disconnectUser(userId)).toBe(true);
    expect(isUserOnline(userId)).toBe(false);
  });
});
