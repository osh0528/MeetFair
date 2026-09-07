import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: { KAKAO_REST_API_KEY: "test key" } }));

describe("getTransitDirections", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the fastest valid Kakao public transit route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        routes: [
          { properties: { totalTime: 2_400, totalDistance: 14_000 } },
          { properties: { totalTime: 1_800, totalDistance: 12_345 } },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTransitDirections } = await import("./kakao-transit.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).resolves.toEqual({ durationMinutes: 30, distanceMeters: 12_345 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v2/routing/publictraffic?");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "KakaoAK test key" });
  });

  it("rejects a response without a public transit route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "NO_RESULTS" }),
    }));
    const { getTransitDirections } = await import("./kakao-transit.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).rejects.toMatchObject({ code: "TRANSIT_NO_ROUTE", status: 404 });
  });

  it("does not expose an upstream error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { getTransitDirections } = await import("./kakao-transit.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).rejects.toMatchObject({ code: "TRANSIT_API_ERROR", status: 502 });
  });

  it("fails clearly when the Kakao REST API key is missing", async () => {
    const { env } = await import("../config/env.js");
    const previousKey = env.KAKAO_REST_API_KEY;
    env.KAKAO_REST_API_KEY = "";
    const { getTransitDirections } = await import("./kakao-transit.js");
    try {
      await expect(getTransitDirections(
        { latitude: 37.5, longitude: 127.0 },
        { latitude: 37.6, longitude: 127.1 },
      )).rejects.toMatchObject({ code: "TRANSIT_NOT_CONFIGURED", status: 503 });
    } finally {
      env.KAKAO_REST_API_KEY = previousKey;
    }
  });
});
