import { describe, expect, it } from "vitest";
import { buildMeetingMapRoutes } from "./meeting-map-routes";

describe("meeting map routes", () => {
  it("builds solid Kakao route lines and participant origin markers", () => {
    const result = buildMeetingMapRoutes([{
      userId: "user-1",
      approximate: false,
      points: [
        { latitude: 37.5, longitude: 127.0 },
        { latitude: 37.6, longitude: 127.1 },
      ],
    }], "candidate-1", new Map([["user-1", "민수"]]));

    expect(result.mapRoutes[0]).toMatchObject({
      id: "route:home:user-1:candidate-1",
      dashed: false,
      points: expect.any(Array),
    });
    expect(result.originMarkers[0]).toMatchObject({
      label: "민수 출발",
      latitude: 37.5,
      longitude: 127.0,
    });
  });

  it("drops routes without drawable geometry", () => {
    const result = buildMeetingMapRoutes([
      { userId: "user-1", approximate: false, points: [{ latitude: 37.5, longitude: 127.0 }] },
    ], "candidate-1", new Map());
    expect(result).toEqual({ mapRoutes: [], originMarkers: [] });
  });
});
