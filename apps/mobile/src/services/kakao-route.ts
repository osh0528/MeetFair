import { Linking } from "react-native";

interface KakaoRouteInput {
  startLatitude?: number;
  startLongitude?: number;
  startName?: string;
  endLatitude: number;
  endLongitude: number;
  endName?: string;
}

function isValidCoordinate(latitude: number | undefined, longitude: number | undefined): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

// 확정 장소를 카카오맵 앱의 대중교통 길찾기로 연결합니다. 앱이 없으면 모바일 웹으로 대체합니다.
export async function openKakaoRoute(input: KakaoRouteInput): Promise<void> {
  const hasStart = isValidCoordinate(input.startLatitude, input.startLongitude);
  const params = hasStart
    ? `sp=${input.startLatitude},${input.startLongitude}&ep=${input.endLatitude},${input.endLongitude}&by=PUBLICTRANSIT`
    : `ep=${input.endLatitude},${input.endLongitude}&by=PUBLICTRANSIT`;
  const schemeUrl = `kakaomap://route?${params}`;
  try {
    await Linking.openURL(schemeUrl);
  } catch {
    const endName = input.endName?.trim() ? input.endName.trim() : "목적지";
    const fallbackUrl = `https://map.kakao.com/link/to/${encodeURIComponent(endName)},${input.endLatitude},${input.endLongitude}`;
    await Linking.openURL(fallbackUrl);
  }
}
