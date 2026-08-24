import { describe, it, expect } from "vitest";
import { kstMidnightUtc, earliestShareTime, canStartSharing } from "./share-window.js";

describe("share-window", () => {
  const scheduledAt = new Date("2026-08-24T12:00:00Z");
  it("kstMidnightUtc", () => {
    expect(kstMidnightUtc(scheduledAt).toISOString()).toBe("2026-08-23T15:00:00.000Z");
  });
  it("DAY_OF earliest at KST midnight", () => {
    const m = { locationShareMode: "DAY_OF" as const, scheduledAt, shareMinutesBefore: null };
    expect(earliestShareTime(m)?.toISOString()).toBe("2026-08-23T15:00:00.000Z");
    expect(canStartSharing(m, new Date("2026-08-23T14:59:59Z")).allowed).toBe(false);
    expect(canStartSharing(m, new Date("2026-08-23T15:00:00Z")).allowed).toBe(true);
  });
  it("BEFORE_START with 30 minutes", () => {
    const m = { locationShareMode: "BEFORE_START" as const, scheduledAt, shareMinutesBefore: 30 };
    expect(earliestShareTime(m)?.toISOString()).toBe("2026-08-24T11:30:00.000Z");
  });
  it("OFF never", () => {
    const m = { locationShareMode: "OFF" as const, scheduledAt, shareMinutesBefore: null };
    expect(earliestShareTime(m)).toBeNull();
    const decision = canStartSharing(m, new Date());
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("SHARE_MODE_OFF");
  });
  it("BEFORE_START default 60 when null", () => {
    const m = { locationShareMode: "BEFORE_START" as const, scheduledAt, shareMinutesBefore: null };
    expect(earliestShareTime(m)?.toISOString()).toBe("2026-08-24T11:00:00.000Z");
  });
});
