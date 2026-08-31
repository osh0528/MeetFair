import { AppError } from "./app-error.js";
import { env } from "../config/env.js";

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
      const body = await res.text().catch(() => "");
      throw new AppError(502, "TRANSIT_API_ERROR", `ODsay failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      result?: { path?: Array<{ info?: { totalTime?: number; totalDistance?: number } }> };
      error?: { message?: string };
    };
    if (data.error) {
      throw new AppError(502, "TRANSIT_API_ERROR", data.error.message ?? "ODsay error");
    }
    const info = data.result?.path?.[0]?.info;
    if (!info || info.totalTime == null || info.totalDistance == null) {
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
