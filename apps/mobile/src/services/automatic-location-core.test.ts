import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn(), api: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connect: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: mocks.get, setItem: mocks.set, removeItem: mocks.remove } }));
vi.mock("./authStorage", () => ({ getStoredAccessToken: async () => "test-token" }));
vi.mock("./api", () => ({ apiRequest: mocks.api, ApiError: class extends Error {} }));
vi.mock("./socket", () => ({ createMeetingSocket: () => ({ emit: mocks.emit, disconnect: mocks.disconnect }), waitForSocketConnection: mocks.connect }));

describe("automatic location transmission", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(JSON.stringify({ userId: "user", meetingIds: ["meeting"] }));
    mocks.connect.mockResolvedValue(undefined);
  });
  const meeting = (scheduledAt: number, consent = true) => ({ id: "meeting", scheduledAt: new Date(scheduledAt).toISOString(), status: "CONFIRMED", locationShareMode: "BEFORE_START", shareMinutesBefore: 30, participants: [{ userId: "user", locationConsent: consent, arrivedAt: null, sharingStatus: "SHARING" }] });
  const position = () => ({ latitude: 37.5665, longitude: 126.978, accuracy: 5, timestamp: Date.now() });

  it("does not connect or transmit before the sharing window", async () => {
    mocks.api.mockResolvedValue(meeting(Date.now() + 3600_000));
    const { transmitAutomaticPosition } = await import("./automatic-location-core");
    await transmitAutomaticPosition(position());
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("removes revoked consent without transmitting a location", async () => {
    mocks.api.mockResolvedValue(meeting(Date.now(), false));
    const { transmitAutomaticPosition } = await import("./automatic-location-core");
    await transmitAutomaticPosition(position());
    expect(mocks.remove).toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("awaits the server sample before disconnecting", async () => {
    const sample = position();
    mocks.api.mockResolvedValueOnce(meeting(Date.now())).mockResolvedValueOnce({ locations: [{ userId: "user", updatedAt: new Date(sample.timestamp).toISOString(), arrivedAt: null }] });
    const { transmitAutomaticPosition } = await import("./automatic-location-core");
    await transmitAutomaticPosition(sample);
    expect(mocks.emit).toHaveBeenCalledWith("location:update", expect.objectContaining({ meetingId: "meeting", latitude: sample.latitude }));
    expect(mocks.api).toHaveBeenLastCalledWith("/meetings/meeting/locations", expect.anything());
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
