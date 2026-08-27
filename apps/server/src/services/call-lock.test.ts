import { describe, expect, it } from "vitest";
import {
  callLeaveLockedUntil,
  callLeaveLockRemainingMs,
  MINIMUM_CALL_DURATION_MS,
} from "./call-lock.js";

describe("meeting call minimum duration", () => {
  const joinedAt = new Date("2026-08-27T00:00:00.000Z");

  it("locks leaving for five minutes after the first join", () => {
    expect(callLeaveLockedUntil(joinedAt).toISOString()).toBe("2026-08-27T00:05:00.000Z");
    expect(callLeaveLockRemainingMs(joinedAt, new Date("2026-08-27T00:02:00.000Z")))
      .toBe(3 * 60_000);
  });

  it("allows leaving once five minutes have elapsed", () => {
    expect(MINIMUM_CALL_DURATION_MS).toBe(300_000);
    expect(callLeaveLockRemainingMs(joinedAt, new Date("2026-08-27T00:05:00.000Z"))).toBe(0);
    expect(callLeaveLockRemainingMs(joinedAt, new Date("2026-08-27T00:06:00.000Z"))).toBe(0);
  });
});
