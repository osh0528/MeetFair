import { AppError } from "./app-error.js";
import { env } from "../config/env.js";
import { distanceMeters } from "./geo.js";

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
  if (distanceMeters(origin.latitude, origin.longitude, destination.latitude, destination.longitude) < 30) {
    const d = Math.round(distanceMeters(origin.latitude, origin.longitude, destination.latitude, destination.longitude));
    return { durationMinutes: 1, distanceMeters: d };
  }
  const key = kakaoKey();
  const url =
    `https://dapi.kakao.com/v2/routing/publictraffic?` +
    `start_x=`+origin.longitude+`&start_y=`+origin.latitude +
    `&end_x=`+destination.longitude+`&end_y=`+destination.latitude +
    `&input_coord=WGS84&output_coord=WGS84`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK `+key },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (body.includes("NO_RESULTS") || body.includes("STARTNODES_NULL") || body.includes("ENDNODES_NULL")) {
        throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
      }
      throw new AppError(502, "TRANSIT_API_ERROR", "Transit routing failed");
    }
    const data = await res.json() as {
      routes?: Array<{ properties?: { totalTime?: number; totalDistance?: number } }>;
      code?: string;
      msg?: string;
    };
    if (!data.routes || data.routes.length === 0) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    const code = (data as { code?: string }).code;
    if (code === "NO_RESULTS" || code === "STARTNODES_NULL" || code === "ENDNODES_NULL") {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    const valid = data.routes.map(r => r.properties).filter((p): p is { totalTime: number; totalDistance: number } => !!p && typeof p.totalTime === "number" && typeof p.totalDistance === "number" && p.totalTime > 0 && p.totalDistance > 0);
    if (valid.length === 0) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    let best = valid[0]!;
    for (const p of valid) { if (p.totalTime < best.totalTime) best = p; }
    if (best.totalTime > 86400 || best.totalDistance > 2000000) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    return {
      durationMinutes: Math.max(1, Math.round(best.totalTime / 60)),
      distanceMeters: Math.round(best.totalDistance),
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
