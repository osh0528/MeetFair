import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: { KAKAO_REST_API_KEY: "test key" } }));

describe("getDrivingDirections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests and parses detailed road vertices only when needed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          summary: { distance: 12_345, duration: 1_800 },
          sections: [{ roads: [{ vertexes: [127, 37.5, 127.1, 37.6] }] }],
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getDrivingDirections } = await import("./naver-maps.js");

    await expect(getDrivingDirections(
      { latitude: 37.5, longitude: 127 },
      { latitude: 37.6, longitude: 127.1 },
      "trafast",
      true,
    )).resolves.toEqual({
      durationMinutes: 30,
      distanceMeters: 12_345,
      points: [
        { latitude: 37.5, longitude: 127 },
        { latitude: 37.6, longitude: 127.1 },
      ],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("summary=false");
  });
});
