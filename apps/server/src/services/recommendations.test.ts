import { describe, expect, it } from "vitest";
import { rankRecommendationCandidates } from "./recommendations.js";

function candidate(id: string, times: number[], distanceMeters = 100) {
  return {
    id,
    name: id,
    address: id,
    category: "카페",
    latitude: 37.5,
    longitude: 127,
    distanceMeters,
    providerPlaceId: `kakao:${id}`,
    travelTimes: times.map((durationMinutes, index) => ({
      userId: String(index),
      nickname: String(index),
      durationMinutes,
      distanceMeters: durationMinutes * 500,
    })),
  };
}

describe("rankRecommendationCandidates", () => {
  it("prioritizes the smallest participant arrival-time gap", () => {
    const ranked = rankRecommendationCandidates([
      candidate("fast-but-unfair", [10, 18]),
      candidate("fair", [20, 22]),
    ]);
    expect(ranked[0]?.id).toBe("fair");
  });

  it("uses maximum then average travel time as tie breakers", () => {
    const ranked = rankRecommendationCandidates([
      candidate("slow", [25, 29]),
      candidate("fast", [14, 18]),
    ]);
    expect(ranked[0]?.id).toBe("fast");
  });

  it("uses distance fairness when the meeting metric is DISTANCE", () => {
    const nearButUneven = candidate("near-but-uneven", [10, 10], 100);
    nearButUneven.travelTimes[0]!.distanceMeters = 100;
    nearButUneven.travelTimes[1]!.distanceMeters = 1000;
    const fair = candidate("fair", [50, 60], 500);
    fair.travelTimes[0]!.distanceMeters = 500;
    fair.travelTimes[1]!.distanceMeters = 550;

    expect(rankRecommendationCandidates([nearButUneven, fair], "DISTANCE")[0]?.id).toBe("fair");
  });
});
