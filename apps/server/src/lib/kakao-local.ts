import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

export interface KakaoPlace {
  id: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

export async function searchNearbyKakaoPlaces(input: {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
}): Promise<KakaoPlace[]> {
  if (!env.KAKAO_REST_API_KEY) {
    throw new AppError(503, "KAKAO_LOCAL_NOT_CONFIGURED", "Kakao REST API 키를 서버에 설정해 주세요.");
  }

  const params = new URLSearchParams({
    query: input.query,
    x: String(input.longitude),
    y: String(input.latitude),
    radius: String(input.radiusMeters ?? 3000),
    size: "15",
    sort: "distance",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(502, "KAKAO_LOCAL_FAILED", `Kakao 장소 검색에 실패했습니다: ${response.status}`);
    }
    const data = await response.json() as {
      documents: Array<{
        id: string;
        place_name: string;
        address_name: string;
        road_address_name: string;
        category_name: string;
        x: string;
        y: string;
        distance: string;
      }>;
    };
    return data.documents.map((place) => ({
      id: place.id,
      name: place.place_name,
      address: place.road_address_name || place.address_name || place.place_name,
      category: place.category_name || input.query,
      latitude: Number(place.y),
      longitude: Number(place.x),
      distanceMeters: Number(place.distance) || 0,
    }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "KAKAO_LOCAL_FAILED", "Kakao 장소 검색에 실패했습니다.");
  } finally {
    clearTimeout(timeout);
  }
}
