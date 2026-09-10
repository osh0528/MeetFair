import { afterEach, describe, expect, it, vi } from "vitest";
import { pushRequest } from "./push-request.js";

describe("push transport retries", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("recovers from a temporary service error", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = pushRequest("https://exp.host/--/api/v2/push/send", {});
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not retry invalid credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    expect((await pushRequest("https://exp.host/--/api/v2/push/send", {})).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds repeated rate-limit failures", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const result = pushRequest("https://exp.host/--/api/v2/push/send", {});
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
