import { describe, expect, it } from "vitest";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

describe("meeting-calls LiveKit token", () => {
  it("token canPublishSources includes CAMERA and MICROPHONE", async () => {
    const at = new AccessToken("test-api-key", "test-api-secret-supercalifragilistic", {
      identity: "user-1",
      name: "Tester",
      ttl: "15m",
    });
    at.addGrant({
      room: "test-room",
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
      canSubscribe: true,
    });
    const jwt = await at.toJwt();
    const decoded = decodeJwtPayload(jwt) as { video?: { canPublishSources?: unknown[] } };
    const sources = decoded.video?.canPublishSources;

    expect(Array.isArray(sources)).toBe(true);
    // LiveKit converts TrackSource enum to strings: "camera", "microphone"
    expect(sources).toEqual(expect.arrayContaining(["camera", "microphone"]));
    expect(sources).toContain("camera");
    expect(sources).toContain("microphone");
    expect(sources).toHaveLength(2);
  });

  it("meeting-calls.ts token creation sets canPublishSources with CAMERA and MICROPHONE", () => {
    const filePath = resolve(__dirname, "meeting-calls.ts");
    const content = readFileSync(filePath, "utf-8");
    // Pins the route's AccessToken grant to include both sources
    expect(content).toContain("canPublishSources");
    expect(content).toContain("TrackSource.CAMERA");
    expect(content).toContain("TrackSource.MICROPHONE");
    // Ensure the array includes both in the same canPublishSources literal
    // This will fail if only CAMERA is present (current bug)
    expect(content).toMatch(/canPublishSources:\s*\[.*TrackSource\.CAMERA.*TrackSource\.MICROPHONE.*\]/s);
  });
});
