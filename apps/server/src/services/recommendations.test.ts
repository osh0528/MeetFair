import { beforeEach, describe, expect, it, vi } from "vitest";

const naverMocks = vi.hoisted(() => ({
  getDrivingDirections: vi.fn(),
  reverseGeocode: vi.fn(),
}));
const odsayMocks = vi.hoisted(() => ({
  getTransitDirections: vi.fn(),
}));
const searchMocks = vi.hoisted(() => ({
  searchLocalPlaces: vi.fn(),
}));

vi.mock("../lib/naver-maps.js", () => naverMocks);
vi.mock("../lib/odsay.js", () => odsayMocks);
vi.mock("../lib/naver-search.js", () => searchMocks);
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    meeting: { findUnique: vi.fn() },
    placeCandidate: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        placeCandidate: {
          deleteMany: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
            id: `cand-${Math.random()}`,
            name: data.name,
            address: data.address,
            latitude: data.latitude,
            longitude: data.longitude,
            category: data.category,
            providerPlaceId: null,
            recommendationRank: 1,
            travelEstimates: (data as { travelEstimates: { create: Array<{ userId: string; durationMinutes: number; distanceMeters: number }> } }).travelEstimates.create.map(
              (e: { userId: string; durationMinutes: number; distanceMeters: number }) => ({
                userId: e.userId,
                user: { id: e.userId, nickname: e.userId === "u1" ? "Alice" : "Bob" },
                durationMinutes: e.durationMinutes,
                distanceMeters: e.distanceMeters,
              }),
            ),
          })),
        },
      };
      return cb(tx as never);
    }),
  },
}));

function meetingFixture(metric: "TRANSIT" | "CAR" | "DISTANCE" = "CAR") {
  return {
    id: "m1",
    title: "테스트 모임",
    travelMetric: metric,
    participants: [
      { userId: "u1", originLatitude: 37.5665, originLongitude: 126.978, user: { id: "u1", nickname: "Alice", homeLatitude: 37.5665, homeLongitude: 126.978 } },
      { userId: "u2", originLatitude: 37.57, originLongitude: 126.982, user: { id: "u2", nickname: "Bob", homeLatitude: 37.57, homeLongitude: 126.982 } },
    ],
    placeCandidates: [],
  } as never;
}

describe("recommendations - transit and routing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearRouteCacheForTest } = await import("./recommendations.js");
    clearRouteCacheForTest();
    searchMocks.searchLocalPlaces.mockResolvedValue([
      { title: "Place A", address: "Addr A", roadAddress: "Addr A", category: "cafe", latitude: 37.568, longitude: 126.98 },
      { title: "Place B", address: "Addr B", roadAddress: "Addr B", category: "cafe", latitude: 37.569, longitude: 126.981 },
      { title: "Place C", address: "Addr C", roadAddress: "Addr C", category: "cafe", latitude: 37.567, longitude: 126.979 },
    ]);
    naverMocks.reverseGeocode.mockResolvedValue({ roadAddress: "서울 중구", address: "서울 중구" });
  });

  it("calls ODsay for TRANSIT", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("TRANSIT"));
    odsayMocks.getTransitDirections.mockResolvedValue({ durationMinutes: 20, distanceMeters: 5000 });
    const { generateRecommendations } = await import("./recommendations.js");
    await generateRecommendations("m1", "u1");
    expect(odsayMocks.getTransitDirections).toHaveBeenCalled();
    expect(naverMocks.getDrivingDirections).not.toHaveBeenCalled();
  });

  it("calls Naver for CAR", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("CAR"));
    naverMocks.getDrivingDirections.mockResolvedValue({ durationMinutes: 15, distanceMeters: 4000 });
    const { generateRecommendations } = await import("./recommendations.js");
    await generateRecommendations("m1", "u1");
    expect(naverMocks.getDrivingDirections).toHaveBeenCalled();
    expect(odsayMocks.getTransitDirections).not.toHaveBeenCalled();
  });

  it("does not call external API for DISTANCE", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("DISTANCE"));
    const { generateRecommendations } = await import("./recommendations.js");
    await generateRecommendations("m1", "u1");
    expect(naverMocks.getDrivingDirections).not.toHaveBeenCalled();
    expect(odsayMocks.getTransitDirections).not.toHaveBeenCalled();
  });

  it("throws 503 when ODsay key missing", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("TRANSIT"));
    const { AppError } = await import("../lib/app-error.js");
    odsayMocks.getTransitDirections.mockRejectedValue(new AppError(503, "TRANSIT_NOT_CONFIGURED", "not configured"));
    const { generateRecommendations } = await import("./recommendations.js");
    await expect(generateRecommendations("m1", "u1")).rejects.toMatchObject({ code: "TRANSIT_NOT_CONFIGURED" });
  });

  it("throws on timeout", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("TRANSIT"));
    const { AppError } = await import("../lib/app-error.js");
    odsayMocks.getTransitDirections.mockRejectedValue(new AppError(504, "TRANSIT_TIMEOUT", "timeout"));
    const { generateRecommendations } = await import("./recommendations.js");
    await expect(generateRecommendations("m1", "u1")).rejects.toMatchObject({ code: "TRANSIT_TIMEOUT" });
  });

  it("excludes candidate with no route", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("TRANSIT"));
    const { AppError } = await import("../lib/app-error.js");
    odsayMocks.getTransitDirections
      .mockRejectedValueOnce(new AppError(502, "TRANSIT_NO_ROUTE", "no route"))
      .mockResolvedValue({ durationMinutes: 10, distanceMeters: 2000 });
    // Need at least one place where first origin fails -> whole place skipped, so we expect fewer candidates than places
    searchMocks.searchLocalPlaces.mockResolvedValue([
      { title: "Place X", address: "Addr X", roadAddress: "Addr X", category: "cafe", latitude: 37.568, longitude: 126.98 },
    ]);
    const { generateRecommendations } = await import("./recommendations.js");
    const result = await generateRecommendations("m1", "u1");
    // Place with no route should be excluded -> 0 candidates persisted -> 0 recommendations
    expect(result).toHaveLength(0);
  });

  it("sorts by gap → max → avg", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue(meetingFixture("CAR"));
    // Place A: gap 2 (10,12) avg 11 max 12
    // Place B: gap 2 (20,22) avg 21 max 22 -> gap tie, max decides A before B
    // Place C: gap 0 (15,15) avg 15 max 15 -> gap smallest, should be first
    naverMocks.getDrivingDirections
      .mockResolvedValueOnce({ durationMinutes: 10, distanceMeters: 1000 }) // A u1
      .mockResolvedValueOnce({ durationMinutes: 12, distanceMeters: 1200 }) // A u2
      .mockResolvedValueOnce({ durationMinutes: 20, distanceMeters: 2000 }) // B u1
      .mockResolvedValueOnce({ durationMinutes: 22, distanceMeters: 2200 }) // B u2
      .mockResolvedValueOnce({ durationMinutes: 15, distanceMeters: 1500 }) // C u1
      .mockResolvedValueOnce({ durationMinutes: 15, distanceMeters: 1500 }); // C u2
    const { generateRecommendations } = await import("./recommendations.js");
    const result = await generateRecommendations("m1", "u1");
    expect(result[0]!.timeGapMinutes).toBe(0);
    expect(result[1]!.timeGapMinutes).toBe(2);
    expect(result[1]!.maximumDurationMinutes).toBe(12);
    expect(result[2]!.maximumDurationMinutes).toBe(22);
  });

  it("midpoint requires exactly two origins", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.meeting.findUnique).mockResolvedValue({
      id: "m1",
      title: "t",
      travelMetric: "CAR",
      participants: [{ userId: "u1", originLatitude: 37.5, originLongitude: 126.9, user: { id: "u1", nickname: "A", homeLatitude: null, homeLongitude: null } }],
      placeCandidates: [],
    } as never);
    const { generateMidpointRecommendations } = await import("./recommendations.js");
    await expect(generateMidpointRecommendations("m1", "u1")).rejects.toMatchObject({ code: "MIDPOINT_REQUIRES_TWO_ORIGINS" });
  });
});
