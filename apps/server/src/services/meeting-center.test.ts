import { describe, expect, it } from "vitest";
import { meetingCenters, meetingCentroid } from "./meeting-center.js";

describe("meetingCentroid", () => {
  it("returns the only participant coordinate", () => {
    const center = meetingCentroid([
      { latitude: 37.5, longitude: 126.9 },
    ]);
    expect(center.latitude).toBe(37.5);
    expect(center.longitude).toBe(126.9);
  });

  it("returns the midpoint for two participants", () => {
    const center = meetingCentroid([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.7, longitude: 127.1 },
    ]);
    expect(center.latitude).toBeCloseTo(37.6, 8);
    expect(center.longitude).toBeCloseTo(127, 8);
  });

  it("returns the arithmetic centroid for three participants", () => {
    const center = meetingCentroid([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 4 },
      { latitude: 3, longitude: 0 },
    ]);
    expect(center.latitude).toBeCloseTo(1, 8);
    expect(center.longitude).toBeCloseTo(4 / 3, 8);
  });

  it("includes every participant when calculating the centroid", () => {
    const center = meetingCentroid([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.5, longitude: 127.1 },
      { latitude: 37.7, longitude: 127.1 },
      { latitude: 37.9, longitude: 126.9 },
    ]);
    expect(center.latitude).toBeCloseTo(37.65, 8);
    expect(center.longitude).toBeCloseTo(127, 8);
  });

  it("rejects an empty participant list", () => {
    expect(() => meetingCentroid([])).toThrow("At least one coordinate is required.");
  });
});

describe("meetingCenters", () => {
  it("calculates the incenter, centroid, and circumcenter for a triangle", () => {
    const centers = meetingCenters([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 4 },
      { latitude: 3, longitude: 0 },
    ]);

    expect(centers.incenter.latitude).toBeCloseTo(1, 3);
    expect(centers.incenter.longitude).toBeCloseTo(1, 3);
    expect(centers.centroid.latitude).toBeCloseTo(1, 8);
    expect(centers.centroid.longitude).toBeCloseTo(4 / 3, 8);
    expect(centers.circumcenter.latitude).toBeCloseTo(1.5, 8);
    expect(centers.circumcenter.longitude).toBeCloseTo(2, 8);
  });

  it("uses all participants for generalized centers", () => {
    const centers = meetingCenters([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 6 },
      { latitude: 2, longitude: 6 },
      { latitude: 4, longitude: 0 },
    ]);

    expect(centers.centroid.latitude).toBeCloseTo(1.5, 8);
    expect(centers.centroid.longitude).toBeCloseTo(3, 8);
    expect(Number.isFinite(centers.incenter.latitude)).toBe(true);
    expect(Number.isFinite(centers.circumcenter.longitude)).toBe(true);
  });

  it("keeps the geometric circumcenter for an obtuse triangle", () => {
    const centers = meetingCenters([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 4 },
      { latitude: 1, longitude: 1 },
    ]);

    expect(centers.circumcenter.latitude).toBeCloseTo(-1, 3);
    expect(centers.circumcenter.longitude).toBeCloseTo(2, 3);
  });

  it("falls back to the outer midpoint for collinear participants", () => {
    const centers = meetingCenters([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 0, longitude: 6 },
    ]);

    expect(centers.incenter.longitude).toBeCloseTo(3, 8);
    expect(centers.circumcenter.longitude).toBeCloseTo(3, 8);
  });
});
