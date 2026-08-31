import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: { ODSAY_API_KEY: "test key" } }));

describe("getTransitDirections", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  it("returns the first public transit route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { path: [{ info: { totalTime: 37, totalDistance: 12_345 } }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTransitDirections } = await import("./odsay.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).resolves.toEqual({ durationMinutes: 37, distanceMeters: 12_345 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("apiKey=test+key");
  });

  it("rejects an empty or invalid route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { path: [] } }),
    }));
    const { getTransitDirections } = await import("./odsay.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).rejects.toMatchObject({ code: "TRANSIT_NO_ROUTE", status: 404 });
  });

  it("does not expose the upstream error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { getTransitDirections } = await import("./odsay.js");

    await expect(getTransitDirections(
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.6, longitude: 127.1 },
    )).rejects.toMatchObject({ code: "TRANSIT_API_ERROR", status: 502 });
  });

  it("fails clearly when the API key is missing", async () => {
    const { env } = await import("../config/env.js");
    const previousKey = env.ODSAY_API_KEY;
    env.ODSAY_API_KEY = "";
    const { getTransitDirections } = await import("./odsay.js");
    try {
      await expect(getTransitDirections(
        { latitude: 37.5, longitude: 127.0 },
        { latitude: 37.6, longitude: 127.1 },
      )).rejects.toMatchObject({ code: "TRANSIT_NOT_CONFIGURED", status: 503 });
    } finally {
      env.ODSAY_API_KEY = previousKey;
    }
  });
});
