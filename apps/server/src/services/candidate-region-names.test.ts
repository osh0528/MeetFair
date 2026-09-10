import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ kakao: vi.fn(), naver: vi.fn() }));
vi.mock("../lib/kakao-local.js", () => ({ getKakaoCoordinateAddress: mocks.kakao }));
vi.mock("../lib/naver-maps.js", () => ({ reverseGeocode: mocks.naver }));

describe("candidate location labels", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.kakao.mockReset();
    mocks.naver.mockReset();
  });

  it("replaces existing generic names with full addresses without moving the candidates", async () => {
    mocks.kakao.mockResolvedValue("서울특별시 중구 세종대로 110");
    const { applyCandidateRegionNames } = await import("./candidate-region-names.js");
    const candidate = { providerPlaceId: "meetfair:center:centroid", name: "추천 지역 3", address: "roadaddr", latitude: 37.5665, longitude: 126.978 };
    await applyCandidateRegionNames([candidate]);
    expect(candidate).toMatchObject({ name: "서울특별시 중구 세종대로 110", address: "서울특별시 중구 세종대로 110", latitude: 37.5665, longitude: 126.978 });
    expect(mocks.naver).not.toHaveBeenCalled();
  });

  it("uses the secondary provider when Kakao cannot find an address", async () => {
    mocks.kakao.mockRejectedValue(new Error("unavailable"));
    mocks.naver.mockResolvedValue({ address: "서울특별시 중구 태평로1가 31", roadAddress: "" });
    const { candidateLocationLabel } = await import("./candidate-region-names.js");
    expect(await candidateLocationLabel(37.5665, 126.978)).toBe("서울특별시 중구 태평로1가 31");
  });

  it("shows coordinates when neither provider can resolve the location", async () => {
    mocks.kakao.mockRejectedValue(new Error("unavailable"));
    mocks.naver.mockRejectedValue(new Error("unavailable"));
    const { candidateLocationLabel } = await import("./candidate-region-names.js");
    expect(await candidateLocationLabel(37.5665, 126.978, "addr")).toBe("위도 37.566500, 경도 126.978000");
  });
});
