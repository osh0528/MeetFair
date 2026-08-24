import { describe, it, expect } from "vitest";
import { distanceMeters, nextProximityCount, hasConsecutivelyArrived } from "./geo.js";

describe("geo", () => {
  it("distanceMeters returns 0 for same point", () => {
    expect(distanceMeters(37.5665, 126.978, 37.5665, 126.978)).toBe(0);
  });
  it("distanceMeters equator 1 degree", () => {
    const d = distanceMeters(0, 0, 0, 1);
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(112000);
  });
  it("nextProximityCount increments when within", () => {
    expect(nextProximityCount(0, true)).toBe(1);
    expect(nextProximityCount(1, true)).toBe(2);
  });
  it("nextProximityCount resets when outside", () => {
    expect(nextProximityCount(2, false)).toBe(0);
  });
  it("hasConsecutivelyArrived true at 2", () => {
    expect(hasConsecutivelyArrived(2)).toBe(true);
    expect(hasConsecutivelyArrived(1)).toBe(false);
  });
});
