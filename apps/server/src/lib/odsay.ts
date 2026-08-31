import { AppError } from "./app-error.js";
import { env } from "../config/env.js";
import { haversineDistance } from "./geo.js";

export interface TransitResult {
  distanceMeters: number;
  durationMinutes: number;
}

function odsayKey(): string {
  if (!env.ODSAY_API_KEY) {
    throw new AppError(503, "TRANSIT_NOT_CONFIGURED", "ODsay API key is not configured.");
  }
  return env.ODSAY_API_KEY;
}

export async function getTransitDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<TransitResult> {
  if (haversineDistance(origin, destination) < 30) {
    const d = Math.round(haversineDistance(origin, destination));
    return { durationMinutes: 1, distanceMeters: d };
  }
  const key = odsayKey();
  const url =
    `https://api.odsay.com/v1/api/searchPubTransPathT?` +
    `SX=${origin.longitude}&SY=${origin.latitude}` +
    `&EX=${destination.longitude}&EY=${destination.latitude}` +
    `&apiKey=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new AppError(502, "TRANSIT_API_ERROR", "Transit routing failed");
    }
    const data = (await res.json()) as {
      result?: { path?: Array<{ info?: { totalTime?: number; totalDistance?: number } }> };
      error?: { code?: string; message?: string };
    };
    if (data.error) {
      throw new AppError(502, "TRANSIT_API_ERROR", "Transit routing failed");
    }
    const path = data.result?.path;
    if (!path || path.length === 0) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    const info = path[0]?.info;
    if (
      !info ||
      info.totalTime == null ||
      info.totalDistance == null ||
      typeof info.totalTime !== "number" ||
      typeof info.totalDistance !== "number" ||
      info.totalTime <= 0 ||
      info.totalDistance <= 0 ||
      info.totalTime > 1440 ||
      info.totalDistance > 2000000
    ) {
      throw new AppError(502, "TRANSIT_NO_ROUTE", "No transit route found");
    }
    return {
      durationMinutes: Math.max(1, Math.round(info.totalTime)),
      distanceMeters: Math.round(info.totalDistance),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new AppError(504, "TRANSIT_TIMEOUT", "ODsay request timed out");
    }
    throw new AppError(502, "TRANSIT_FAILED", "ODsay request failed");
  } finally {
    clearTimeout(timeout);
  }
}
