import { describe, expect, it } from "vitest";
import { meetingIncenter } from "./meeting-center.js";

describe("meetingIncenter", () => {
  it("returns the midpoint for two participants", () => {
    const center = meetingIncenter([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.7, longitude: 127.1 },
    ]);
    expect(center.latitude).toBeCloseTo(37.6, 8);
    expect(center.longitude).toBeCloseTo(127, 8);
  });

  it("returns the triangle incenter for three participants", () => {
    const center = meetingIncenter([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 4 },
      { latitude: 3, longitude: 0 },
    ]);
    expect(center.latitude).toBeCloseTo(1, 3);
    expect(center.longitude).toBeCloseTo(1, 3);
  });

  it("finds the largest inscribed-circle center for four participants", () => {
    const center = meetingIncenter([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.5, longitude: 127.1 },
      { latitude: 37.7, longitude: 127.1 },
      { latitude: 37.7, longitude: 126.9 },
    ]);
    expect(center.latitude).toBeCloseTo(37.6, 5);
    expect(center.longitude).toBeCloseTo(127, 5);
  });
});
