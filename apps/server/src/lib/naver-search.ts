import { AppError } from "./app-error.js";
import { env } from "../config/env.js";

export interface PlaceSearchResult {
  title: string;
  address: string;
  roadAddress: string;
  category: string;
  latitude: number;
  longitude: number;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

export async function searchLocalPlaces(query: string): Promise<PlaceSearchResult[]> {
  if (!env.NAVER_SEARCH_CLIENT_ID || !env.NAVER_SEARCH_CLIENT_SECRET) {
    throw new AppError(503, "PLACE_SEARCH_NOT_CONFIGURED", "Naver place search is not configured.");
  }
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=15&sort=random`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": env.NAVER_SEARCH_CLIENT_ID,
        "X-Naver-Client-Secret": env.NAVER_SEARCH_CLIENT_SECRET,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(502, "PLACE_SEARCH_FAILED", `Naver search failed: ${response.status}`);
    }
    const data = (await response.json()) as {
      items: Array<{ title: string; address: string; roadAddress: string; category: string; mapx: string; mapy: string }>;
    };
    return data.items.map((item) => ({
      title: stripHtml(item.title),
      address: item.roadAddress || item.address,
      roadAddress: item.roadAddress,
      category: item.category,
      latitude: Number(item.mapy) / 1e7,
      longitude: Number(item.mapx) / 1e7,
    }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "PLACE_SEARCH_FAILED", "Naver place search failed.");
  } finally {
    clearTimeout(timeout);
  }
}
