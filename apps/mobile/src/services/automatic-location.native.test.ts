import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ active: vi.fn(), permission: vi.fn(), start: vi.fn(), stop: vi.fn(), schedule: vi.fn(), services: vi.fn() }));
vi.mock("expo-location", () => ({
  Accuracy: { High: 4 }, hasStartedLocationUpdatesAsync: mocks.active,
  getBackgroundPermissionsAsync: mocks.permission, startLocationUpdatesAsync: mocks.start,
  stopLocationUpdatesAsync: mocks.stop, hasServicesEnabledAsync: mocks.services,
}));
vi.mock("expo-task-manager", () => ({ defineTask: vi.fn() }));
vi.mock("./api", () => ({ apiRequest: vi.fn() }));
vi.mock("./automatic-location-core", () => ({ readAutomaticSchedule: mocks.schedule, clearAutomaticSchedule: vi.fn(), registerAutomaticMeeting: vi.fn(), removeAutomaticMeeting: vi.fn(), transmitAutomaticPosition: vi.fn() }));

describe("Android automatic background location service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.schedule.mockResolvedValue({ userId: "user", meetingIds: ["meeting"] });
    mocks.permission.mockResolvedValue({ granted: true });
    mocks.services.mockResolvedValue(true);
  });
  it("registers ongoing location delivery even when stationary", async () => {
    mocks.active.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { syncAutomaticLocation } = await import("./automatic-location.native");
    await syncAutomaticLocation("user");
    expect(mocks.start).toHaveBeenCalledWith("meetfair-automatic-location", expect.objectContaining({ distanceInterval: 0, pausesUpdatesAutomatically: false, foregroundService: expect.objectContaining({ killServiceOnDestroy: false }) }));
  });
  it("reports failure when the native task did not start", async () => {
    mocks.active.mockResolvedValue(false);
    const { syncAutomaticLocation } = await import("./automatic-location.native");
    await expect(syncAutomaticLocation("user")).rejects.toThrow("시작하지 못했습니다");
  });
  it("stops the running task after permission is revoked", async () => {
    mocks.active.mockResolvedValue(true);
    mocks.permission.mockResolvedValue({ granted: false });
    const { syncAutomaticLocation } = await import("./automatic-location.native");
    await expect(syncAutomaticLocation("user")).rejects.toThrow("항상 허용");
    expect(mocks.stop).toHaveBeenCalledWith("meetfair-automatic-location");
  });
});
