import { AppError } from "./app-error.js";
import { env } from "../config/env.js";
import { haversineDistance } from "./geo.js";

export interface TransitResult {
  distanceMeters: number;
  durationMinutes: number;
}

function kakaoKey(): string {
  if (!env.KAKAO_REST_API_KEY) {
    throw new AppError(503, "TRANSIT_NOT_CONFIGURED", "Kakao transit API key is not configured.");
  }
  return env.KAKAO_REST_API_KEY;
}

export async function getTransitDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<TransitResult> {
  if (haversineDistance(origin, destination) < 30) {
    const d = Math.round(haversineDistance(origin, destination));
    return { durationMinutes: 1, distanceMeters: d };
  }
  const key = kakaoKey();
  const url =
    `https://dapi.kakao.com/v2/routing/publictraffic?` +
    `origin=${origin.longitude},${origin.latitude}` +
    `&destination=${destination.longitude},${destination.latitude}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new AppError(502, "TRANSIT_API_ERROR", "Transit routing failed");
    }
    const data = (await res.json()) as {
      routes?: Array<{ summary?: { duration?: number; distance?: number } }>;
      code?: number;
      msg?: string;
    };
    const summary = data.routes?.[0]?.summary;
    if (
      !summary ||
      typeof summary.duration !== "number" ||
      typeof summary.distance !== "number" ||
      summary.duration <= 0 ||
      summary.distance <= 0 ||
      summary.duration > 86400 ||
      summary.distance > 2000000
    ) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    return {
      durationMinutes: Math.max(1, Math.round(summary.duration / 60)),
      distanceMeters: Math.round(summary.distance),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new AppError(504, "TRANSIT_TIMEOUT", "Transit request timed out");
    }
    throw new AppError(502, "TRANSIT_FAILED", "Transit request failed");
  } finally {
    clearTimeout(timeout);
  }
}
