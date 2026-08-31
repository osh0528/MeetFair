import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

export interface TransitResult {
  distanceMeters: number;
  durationMinutes: number;
}

export async function getTransitDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<TransitResult> {
  if (!env.ODSAY_API_KEY) {
    throw new AppError(503, "TRANSIT_NOT_CONFIGURED", "Public transit recommendations are not configured.");
  }

  const params = new URLSearchParams({
    SX: String(origin.longitude),
    SY: String(origin.latitude),
    EX: String(destination.longitude),
    EY: String(destination.latitude),
    apiKey: env.ODSAY_API_KEY,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`https://api.odsay.com/v1/api/searchPubTransPathT?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(502, "TRANSIT_API_ERROR", "The public transit service returned an error.");
    }
    const payload = await response.json() as {
      result?: { path?: Array<{ info?: { totalTime?: number; totalDistance?: number } }> };
      error?: { code?: string; message?: string };
    };
    if (payload.error) {
      throw new AppError(502, "TRANSIT_API_ERROR", "The public transit service returned an error.");
    }
    const info = payload.result?.path?.[0]?.info;
    if (
      !info
      || !Number.isFinite(info.totalTime)
      || !Number.isFinite(info.totalDistance)
      || info.totalTime! <= 0
      || info.totalDistance! <= 0
    ) {
      throw new AppError(404, "TRANSIT_NO_ROUTE", "No public transit route was found.");
    }
    return {
      durationMinutes: Math.max(1, Math.round(info.totalTime!)),
      distanceMeters: Math.max(1, Math.round(info.totalDistance!)),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(504, "TRANSIT_TIMEOUT", "The public transit request timed out.");
    }
    throw new AppError(502, "TRANSIT_FAILED", "The public transit request failed.");
  } finally {
    clearTimeout(timeout);
  }
}
