import { describe, it, expect } from "vitest";
import { isQuietTime, lastEndedQuietWindow, zonedMinuteToUtc } from "./quiet-time.js";

describe("quiet-time", () => {
  it("isQuietTime same-day", () => {
    expect(isQuietTime(600, 900, "Asia/Seoul", new Date("2026-08-24T03:00:00Z"))).toBe(true);
    expect(isQuietTime(600, 900, "Asia/Seoul", new Date("2026-08-24T07:00:00Z"))).toBe(false);
  });
  it("isQuietTime wrap", () => {
    expect(isQuietTime(1320, 480, "Asia/Seoul", new Date("2026-08-24T14:30:00Z"))).toBe(true);
    expect(isQuietTime(1320, 480, "Asia/Seoul", new Date("2026-08-24T03:00:00Z"))).toBe(false);
  });
  it("lastEndedQuietWindow same-day ended", () => {
    const now = new Date("2026-08-24T07:00:00Z");
    const w = lastEndedQuietWindow(now, 600, 900, "Asia/Seoul");
    expect(w?.start.toISOString()).toBe("2026-08-24T01:00:00.000Z");
    expect(w?.end.toISOString()).toBe("2026-08-24T06:00:00.000Z");
  });
  it("lastEndedQuietWindow wrap ended", () => {
    const now = new Date("2026-08-24T02:00:00Z");
    const w = lastEndedQuietWindow(now, 1320, 480, "Asia/Seoul");
    expect(w?.start.toISOString()).toBe("2026-08-23T13:00:00.000Z");
    expect(w?.end.toISOString()).toBe("2026-08-23T23:00:00.000Z");
  });
  it("lastEndedQuietWindow inside wrap returns null", () => {
    const now = new Date("2026-08-23T18:00:00Z");
    expect(lastEndedQuietWindow(now, 1320, 480, "Asia/Seoul")).toBeNull();
  });
  it("zonedMinuteToUtc", () => {
    const ref = new Date("2026-08-24T07:00:00Z");
    expect(zonedMinuteToUtc(ref, "Asia/Seoul", 0, 600).toISOString()).toBe("2026-08-24T01:00:00.000Z");
  });
  it("null quiet hours", () => {
    expect(lastEndedQuietWindow(new Date(), null, null, "Asia/Seoul")).toBeNull();
    expect(isQuietTime(null, null, "Asia/Seoul")).toBe(false);
  });
});
