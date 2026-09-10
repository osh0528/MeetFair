import { reverseGeocode } from "../lib/naver-maps.js";
import { getKakaoCoordinateAddress } from "../lib/kakao-local.js";

const locations = new Map<string, { expiresAt: number; result: Promise<string | null> }>();

export async function candidateLocationLabel(latitude: number, longitude: number, savedAddress?: string): Promise<string> {
  const key = `${latitude}:${longitude}`;
  let cached = locations.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    if (locations.size >= 500) locations.clear();
    const result = getKakaoCoordinateAddress(latitude, longitude)
      .catch(() => reverseGeocode(latitude, longitude).then((location) => location.roadAddress || location.address))
      .catch(() => null);
    cached = { expiresAt: Date.now() + 300_000, result };
    locations.set(key, cached);
  }
  const address = await cached.result;
  return address || (savedAddress && /\d/.test(savedAddress) && !savedAddress.startsWith("추천 지역") ? savedAddress : null)
    || `위도 ${latitude.toFixed(6)}, 경도 ${longitude.toFixed(6)}`;
}

export async function applyCandidateRegionNames(candidates: Array<{
  providerPlaceId: string | null;
  name: string;
  address: string;
  category?: string | null;
  latitude: number;
  longitude: number;
}>) {
  await Promise.all(candidates.map(async (candidate) => {
    if (!candidate.providerPlaceId?.startsWith("meetfair:center:")) return;
    const address = await candidateLocationLabel(candidate.latitude, candidate.longitude, candidate.address);
    candidate.name = address;
    candidate.address = address;
    candidate.category = "위치 후보";
  }));
}
