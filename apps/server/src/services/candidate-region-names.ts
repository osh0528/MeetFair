import { reverseGeocode } from "../lib/naver-maps.js";

const locations = new Map<string, { expiresAt: number; result: ReturnType<typeof reverseGeocode> }>();

export async function applyCandidateRegionNames(candidates: Array<{
  providerPlaceId: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}>) {
  await Promise.all(candidates.map(async (candidate, index) => {
    if (!candidate.providerPlaceId?.startsWith("meetfair:center:")
      || !["내심", "외심", "무게중심"].includes(candidate.name)) return;
    const key = `${candidate.latitude}:${candidate.longitude}`;
    let cached = locations.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      if (locations.size >= 500) locations.clear();
      cached = { expiresAt: Date.now() + 300_000, result: reverseGeocode(candidate.latitude, candidate.longitude) };
      locations.set(key, cached);
    }
    const location = await cached.result.catch(() => null);
    candidate.name = location?.regionName || `추천 지역 ${index + 1}`;
    if (location) candidate.address = location.roadAddress || location.address;
  }));
}
