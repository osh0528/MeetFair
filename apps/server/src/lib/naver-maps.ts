import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

// ── Naver Cloud Maps API ──
// Geocoding: https://maps.apigw.ntruss.com/map-geocode/v2
// Reverse Geocoding: https://maps.apigw.ntruss.com/map-reversegeocode/v2
// Directions 5: https://maps.apigw.ntruss.com/map-direction/v1
// Directions 15: https://maps.apigw.ntruss.com/map-direction-15/v1
// Static Map: https://maps.apigw.ntruss.com/map-static/v2

const BASE = {
  geocode: "https://maps.apigw.ntruss.com/map-geocode/v2",
  reverseGeocode: "https://maps.apigw.ntruss.com/map-reversegeocode/v2",
  direction5: "https://maps.apigw.ntruss.com/map-direction/v1",
  direction15: "https://maps.apigw.ntruss.com/map-direction-15/v1",
  staticMap: "https://maps.apigw.ntruss.com/map-static/v2",
} as const;

function naverHeaders(): Record<string, string> {
  if (!env.NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET) {
    throw new AppError(500, "MAP_NOT_CONFIGURED", "Naver Maps API keys are not configured.");
  }
  return {
    "X-NCP-APIGW-API-KEY-ID": env.NAVER_MAP_CLIENT_ID,
    "X-NCP-APIGW-API-KEY": env.NAVER_MAP_CLIENT_SECRET,
  };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AppError(502, "MAP_API_ERROR", `Naver Maps API failed: ${response.status} ${body.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

// ── Geocoding ──
interface NaverGeocodeResponse {
  status: string;
  meta: { totalCount: number };
  addresses: {
    roadAddress: string;
    jibunAddress: string;
    x: string;
    y: string;
    addressElements: { types: string[]; longName: string }[];
  }[];
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  roadAddress: string;
  jibunAddress: string;
}

export async function geocode(query: string): Promise<GeocodeResult> {
  const url = `${BASE.geocode}/geocode?query=${encodeURIComponent(query)}`;
  const data = await fetchJson<NaverGeocodeResponse>(url, { headers: naverHeaders() });
  if (data.status !== "OK" || data.addresses.length === 0) {
    throw new AppError(404, "GEOCODE_NOT_FOUND", `Address not found: ${query}`);
  }
  const first = data.addresses[0];
  if (!first) throw new AppError(404, "GEOCODE_NOT_FOUND", `Address not found: ${query}`);
  return {
    latitude: Number.parseFloat(first.y),
    longitude: Number.parseFloat(first.x),
    roadAddress: first.roadAddress,
    jibunAddress: first.jibunAddress,
  };
}

// ── Reverse Geocoding ──
interface NaverReverseResponse {
  status: { code: number; name: string; message: string };
  results: {
    name: string;
    region: { area0: { name: string }; area1: { name: string }; area2: { name: string }; area3: { name: string } };
    land: { name: string; number1: string; number2: string; addition0?: { value: string } };
  }[];
}

export interface ReverseGeocodeResult {
  address: string;
  roadAddress: string;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  const url = `${BASE.reverseGeocode}/gc?coords=${longitude},${latitude}&orders=roadaddr,addr&output=json`;
  const data = await fetchJson<NaverReverseResponse>(url, { headers: naverHeaders() });
  if (data.status.code !== 0 || data.results.length === 0) {
    throw new AppError(404, "REVERSE_GEOCODE_NOT_FOUND", `Reverse geocode failed for ${latitude},${longitude}`);
  }
  const road = data.results.find((result) => result.name === "roadaddr");
  const addr = data.results.find((result) => result.name === "addr") ?? road;
  if (!road && !addr) throw new AppError(404, "REVERSE_GEOCODE_NOT_FOUND", "No address found");

  const formatAddress = (result: NaverReverseResponse["results"][number] | undefined) => {
    if (!result) return "";
    const region = [result.region.area1.name, result.region.area2.name, result.region.area3.name].filter(Boolean);
    const landNumber = [result.land.number1, result.land.number2].filter(Boolean).join("-");
    return [...region, result.land.name, landNumber].filter(Boolean).join(" ");
  };
  return {
    roadAddress: formatAddress(road),
    address: formatAddress(addr),
  };
}

// ── Directions ──
interface NaverDirectionResponse {
  code: number;
  message: string;
  route?: {
    trafast?: { summary: { distance: number; duration: number; tollFare: number } }[];
    tracomfort?: { summary: { distance: number; duration: number } }[];
    traoptimal?: { summary: { distance: number; duration: number } }[];
  };
}

export interface DrivingResult {
  distanceMeters: number;
  durationMinutes: number;
  distanceText?: string;
}

export type DirectionOption = "trafast" | "tracomfort" | "traoptimal";

export async function getDrivingDirections(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  option: DirectionOption = "trafast",
): Promise<DrivingResult> {
  // Directions 5: /driving?start=lng,lat&goal=lng,lat&option=trafast
  const base = BASE.direction5;
  const url =
    `${base}/driving?` +
    `start=${origin.longitude},${origin.latitude}` +
    `&goal=${destination.longitude},${destination.latitude}` +
    `&option=${option}`;
  const data = await fetchJson<NaverDirectionResponse>(url, { headers: naverHeaders() });
  if (data.code !== 0 || !data.route) {
    throw new AppError(502, "DIRECTION_FAILED", data.message || "Directions API failed");
  }
  const summary = data.route[option]?.[0]?.summary;
  if (!summary) {
    throw new AppError(502, "DIRECTION_NO_ROUTE", "No route found between origin and destination");
  }
  return {
    distanceMeters: summary.distance,
    durationMinutes: Math.max(1, Math.round(summary.duration / 1000 / 60)),
  };
}

export async function getDrivingDirections15(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  waypoints?: { latitude: number; longitude: number }[],
  option: DirectionOption = "trafast",
): Promise<DrivingResult> {
  // Directions 15 supports waypoints; fallback to direction5 if no waypoints
  if (!waypoints || waypoints.length === 0) {
    return getDrivingDirections(origin, destination, option);
  }
  const base = BASE.direction15;
  const waypointParam = waypoints.map((w) => `${w.longitude},${w.latitude}`).join("|");
  const url =
    `${base}/driving?` +
    `start=${origin.longitude},${origin.latitude}` +
    `&goal=${destination.longitude},${destination.latitude}` +
    `&waypoints=${encodeURIComponent(waypointParam)}` +
    `&option=${option}`;
  const data = await fetchJson<NaverDirectionResponse>(url, { headers: naverHeaders() });
  if (data.code !== 0 || !data.route) {
    throw new AppError(502, "DIRECTION_FAILED", data.message || "Directions 15 API failed");
  }
  const summary = data.route[option]?.[0]?.summary;
  if (!summary) throw new AppError(502, "DIRECTION_NO_ROUTE", "No route found");
  return {
    distanceMeters: summary.distance,
    durationMinutes: Math.max(1, Math.round(summary.duration / 1000 / 60)),
  };
}

// ── Static Map ──
export interface StaticMapOptions {
  center?: { latitude: number; longitude: number };
  level?: number; // zoom 0-20
  width?: number; // 1-1024
  height?: number; // 1-1024
  markers?: { latitude: number; longitude: number; color?: string; label?: string }[];
  format?: "png" | "jpg";
}

export function buildStaticMapUrl(options: StaticMapOptions): string {
  const params = new URLSearchParams();
  if (options.center) {
    params.set("center", `${options.center.longitude},${options.center.latitude}`);
  }
  params.set("level", String(options.level ?? 14));
  params.set("w", String(options.width ?? 600));
  params.set("h", String(options.height ?? 400));
  params.set("scale", "2");
  if (options.format) params.set("format", options.format);
  if (options.markers?.length) {
    // markers: type:t|d|e small/mid | pos: lng lat | color | label
    const markerStrings = options.markers.map((m) => {
      const label = m.label ? `|label:${m.label}` : "";
      const color = m.color ? `|color:0x${m.color.replace("#", "")}` : "";
      return `type:d|size:mid|pos:${m.longitude} ${m.latitude}${color}${label}`;
    });
    for (const ms of markerStrings) {
      params.append("markers", ms);
    }
  }
  // Note: Static Map also requires NCP keys in headers when fetched server-side,
  // but URL can be returned to client where client fetches with keys via proxy or signed URL.
  // For server-side image fetch, caller should fetch with naverHeaders().
  return `${BASE.staticMap}/raster?${params.toString()}`;
}

export async function fetchStaticMapImage(options: StaticMapOptions): Promise<Buffer> {
  const url = buildStaticMapUrl(options);
  const response = await fetch(url, { headers: naverHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AppError(502, "STATIC_MAP_FAILED", `Static Map failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function isNaverMapsConfigured(): boolean {
  return Boolean(env.NAVER_MAP_CLIENT_ID && env.NAVER_MAP_CLIENT_SECRET);
}
