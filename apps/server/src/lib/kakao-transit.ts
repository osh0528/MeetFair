import { env } from "../config/env.js";
import { AppError } from "./app-error.js";
import { distanceMeters } from "./geo.js";

export interface TransitResult {
  distanceMeters: number;
  durationMinutes: number;
  points?: Array<{ latitude: number; longitude: number }>;
}

interface KakaoTransitRoute {
  properties?: {
    totalDistance?: number;
    totalTime?: number;
  };
  sections?: Array<{ roads?: Array<{ vertexes?: number[] }> }>;
}

interface KakaoTransitResponse {
  status?: string;
  routes?: KakaoTransitRoute[];
}

function kakaoRestKey(): string {
  if (!env.KAKAO_REST_API_KEY) {
    throw new AppError(503, "TRANSIT_NOT_CONFIGURED", "Kakao REST API key is not configured.");
  }
  return env.KAKAO_REST_API_KEY;
}

export async function getTransitDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  includePoints = false,
): Promise<TransitResult> {
  const directDistance = distanceMeters(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  if (directDistance < 30) {
    return { durationMinutes: 1, distanceMeters: Math.round(directDistance) };
  }

  const params = new URLSearchParams({
    start_x: String(origin.longitude),
    start_y: String(origin.latitude),
    end_x: String(destination.longitude),
    end_y: String(destination.latitude),
    input_coord: "WGS84",
    output_coord: "WGS84",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`https://dapi.kakao.com/v2/routing/publictraffic?${params}`, {
      headers: { Authorization: `KakaoAK ${kakaoRestKey()}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError(502, "TRANSIT_API_ERROR", "Kakao transit routing failed.");
    }

    const data = await response.json() as KakaoTransitResponse;
    if (data.status !== "OK") {
      if (["STARTNODES_NULL", "ENDNODES_NULL", "EQUAL_POINTS", "NO_RESULTS"].includes(data.status ?? "")) {
        throw new AppError(404, "TRANSIT_NO_ROUTE", "No transit route found.");
      }
      throw new AppError(502, "TRANSIT_API_ERROR", "Kakao transit routing failed.");
    }

    const validRoutes = (data.routes ?? []).flatMap((route) => {
      const totalTime = route.properties?.totalTime;
      const totalDistance = route.properties?.totalDistance;
      if (
        typeof totalTime !== "number" ||
        typeof totalDistance !== "number" ||
        totalTime <= 0 ||
        totalDistance <= 0 ||
        totalTime > 86_400 ||
        totalDistance > 2_000_000
      ) {
        return [];
      }
      return [{ route, totalTime, totalDistance }];
    }).sort((a, b) => a.totalTime - b.totalTime || a.totalDistance - b.totalDistance);

    const bestRoute = validRoutes[0];
    if (!bestRoute) {
      throw new AppError(404, "TRANSIT_NO_ROUTE", "No transit route found.");
    }
    const points = includePoints ? bestRoute.route.sections?.flatMap((section) => section.roads ?? []).flatMap((road) => {
      const vertexes = road.vertexes ?? [];
      const roadPoints: Array<{ latitude: number; longitude: number }> = [];
      for (let index = 0; index + 1 < vertexes.length; index += 2) {
        const longitude = vertexes[index]!;
        const latitude = vertexes[index + 1]!;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) roadPoints.push({ latitude, longitude });
      }
      return roadPoints;
    }) ?? [] : [];
    return {
      durationMinutes: Math.max(1, Math.round(bestRoute.totalTime / 60)),
      distanceMeters: Math.round(bestRoute.totalDistance),
      ...(points.length ? { points } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new AppError(504, "TRANSIT_TIMEOUT", "Kakao transit request timed out.");
    }
    throw new AppError(502, "TRANSIT_FAILED", "Kakao transit request failed.");
  } finally {
    clearTimeout(timeout);
  }
}
