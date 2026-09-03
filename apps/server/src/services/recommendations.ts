import { AppError } from "../lib/app-error.js";
import { haversineDistance, midpointOf } from "../lib/geo.js";
import { getDrivingDirections, reverseGeocode } from "../lib/naver-maps.js";
import { getTransitDirections } from "../lib/kakao-transit.js";
import { searchNearbyKakaoPlaces } from "../lib/kakao-local.js";
import { prisma } from "../lib/prisma.js";
import type { MeetingRecommendation } from "@meetfair/shared";

const ROUTE_CACHE_TTL_MS = 120_000;
const ROUTE_CONCURRENCY = 5;
const routeCache = new Map<string, { value: { durationMinutes: number; distanceMeters: number }; expiresAt: number }>();
const routeInflight = new Map<string, Promise<{ durationMinutes: number; distanceMeters: number }>>();

function routeCacheKey(
  origin: { latitude: number; longitude: number },
  dest: { latitude: number; longitude: number },
  metric: string,
): string {
  return `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}->${dest.latitude.toFixed(5)},${dest.longitude.toFixed(5)}:${metric}`;
}

export function clearRouteCacheForTest(): void {
  routeCache.clear();
  routeInflight.clear();
}

function getCachedRoute(key: string): { durationMinutes: number; distanceMeters: number } | undefined {
  const entry = routeCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    routeCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedRoute(key: string, value: { durationMinutes: number; distanceMeters: number }): void {
  routeCache.set(key, { value, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
}

async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length) as T[];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const idx = next;
      next += 1;
      results[idx] = await tasks[idx]!();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function estimateRoute(
  origin: { latitude: number; longitude: number },
  dest: { latitude: number; longitude: number },
  metric: string,
): Promise<{ durationMinutes: number; distanceMeters: number }> {
  if (metric === "DISTANCE") {
    const dist = Math.round(haversineDistance(origin, dest));
    const duration = Math.max(1, Math.round((dist / 1000 / 4.5) * 60));
    return { durationMinutes: duration, distanceMeters: dist };
  }
  const key = routeCacheKey(origin, dest, metric);
  const cached = getCachedRoute(key);
  if (cached) return cached;
  const inflight = routeInflight.get(key);
  if (inflight) return inflight;
  const promise = (async () => {
    const result =
      metric === "TRANSIT"
        ? await getTransitDirections(origin, dest)
        : await getDrivingDirections(origin, dest);
    setCachedRoute(key, result);
    return result;
  })();
  routeInflight.set(key, promise);
  try {
    const value = await promise;
    return value;
  } finally {
    routeInflight.delete(key);
  }
}

function fairnessScore(gap: number, max: number): number {
  if (max === 0) return 100;
  return Math.max(0, Math.round(100 * (1 - gap / max)));
}

function computeInputHash(
  meeting: { travelMetric: string; categories?: string[] | null },
  origins: Array<{ userId: string; latitude: number; longitude: number }>,
): string {
  const cats = meeting.categories ?? [];
  const sorted = [...origins].sort((a, b) => a.userId.localeCompare(b.userId));
  const payload = JSON.stringify({
    travelMetric: meeting.travelMetric,
    categories: [...cats].sort(),
    origins: sorted.map((o) => ({ userId: o.userId, lat: o.latitude.toFixed(5), lng: o.longitude.toFixed(5) })),
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  return hash.toString(16);
}

export async function generateRecommendations(meetingId: string, requesterId: string): Promise<MeetingRecommendation[]> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { user: { select: { id: true, nickname: true, homeLatitude: true, homeLongitude: true } } } },
      placeCandidates: { include: { votes: true, travelEstimates: { include: { user: { select: { id: true, nickname: true } } } } } },
    },
  });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
  const isParticipant = meeting.participants.some((p) => p.userId === requesterId);
  if (!isParticipant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");

  const hasVotes = meeting.placeCandidates.some((c) => c.votes.length > 0);
  if (hasVotes) {
    return meeting.placeCandidates.map((candidate) => {
      const times = candidate.travelEstimates.map((e) => e.durationMinutes);
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const max = times.length ? Math.max(...times) : 0;
      const gap = times.length ? Math.max(...times) - Math.min(...times) : 0;
      return {
        id: candidate.id,
        providerPlaceId: candidate.providerPlaceId,
        name: candidate.name,
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        category: candidate.category,
        recommendationRank: candidate.recommendationRank ?? 99,
        averageDurationMinutes: avg,
        maximumDurationMinutes: max,
        timeGapMinutes: gap,
        fairnessScore: fairnessScore(gap, max),
        participantTravelTimes: candidate.travelEstimates.map((e) => ({
          userId: e.userId,
          nickname: e.user.nickname,
          durationMinutes: e.durationMinutes,
          distanceMeters: e.distanceMeters,
        })),
      };
    });
  }

  const origins: Array<{ userId: string; nickname: string; latitude: number; longitude: number }> = [];
  for (const p of meeting.participants) {
    let lat: number | null = null;
    let lng: number | null = null;
    if (p.originLatitude != null && p.originLongitude != null) {
      lat = p.originLatitude;
      lng = p.originLongitude;
    } else if (p.user.homeLatitude != null && p.user.homeLongitude != null) {
      lat = p.user.homeLatitude;
      lng = p.user.homeLongitude;
    }
    if (lat != null && lng != null) {
      origins.push({ userId: p.userId, nickname: p.user.nickname, latitude: lat, longitude: lng });
    }
  }
  if (origins.length < 2) {
    const missing = meeting.participants
      .filter((p) => {
        const hasOrigin = p.originLatitude != null && p.originLongitude != null;
        const hasHome = p.user.homeLatitude != null && p.user.homeLongitude != null;
        return !hasOrigin && !hasHome;
      })
      .map((p) => p.userId);
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "At least two participants need origins for recommendations.", {
      missingParticipantIds: missing,
    } as unknown as Record<string, unknown>);
  }

  const query = meeting.title || "맛집";
  const center = midpointOf(origins[0]!, origins[1] ?? origins[0]!);
  const kakaoPlaces = await searchNearbyKakaoPlaces({
    query,
    latitude: center.latitude,
    longitude: center.longitude,
    radiusMeters: 3000,
  });
  const places = kakaoPlaces.map((p) => ({
    title: p.name,
    address: p.address,
    roadAddress: p.address,
    category: p.category,
    latitude: p.latitude,
    longitude: p.longitude,
    providerPlaceId: p.id,
  }));

  const candidates: Array<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    category: string;
    providerPlaceId: string | null;
    travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
  }> = [];

  for (const place of places.slice(0, 12)) {
    const originTasks = origins.map((origin) => async () => {
      if (meeting.travelMetric === "DISTANCE") {
        const dist = Math.round(
          haversineDistance({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: place.latitude, longitude: place.longitude }),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 4.5) * 60));
        return { userId: origin.userId, nickname: origin.nickname, durationMinutes: duration, distanceMeters: dist, skip: false as const };
      }
      try {
        const result = await estimateRoute(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: place.latitude, longitude: place.longitude },
          meeting.travelMetric,
        );
        return {
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: result.durationMinutes,
          distanceMeters: result.distanceMeters,
          skip: false as const,
        };
      } catch (caught) {
        const code = caught instanceof AppError ? (caught as AppError).code : "";
        if (meeting.travelMetric === "TRANSIT") {
          if (code === "TRANSIT_NOT_CONFIGURED" || code === "TRANSIT_API_ERROR" || code === "TRANSIT_TIMEOUT" || code === "TRANSIT_FAILED") {
            throw caught;
          }
          if (code === "TRANSIT_NO_ROUTE") {
            return { skip: true as const };
          }
        }
        const dist = Math.round(
          haversineDistance({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: place.latitude, longitude: place.longitude }),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 30) * 60));
        return { userId: origin.userId, nickname: origin.nickname, durationMinutes: duration, distanceMeters: dist, skip: false as const };
      }
    });
    const results = await runWithLimit(originTasks, ROUTE_CONCURRENCY);
    if (results.some((r) => r.skip)) continue;
    const travelTimes = results as Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
    candidates.push({
      name: place.title,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
      providerPlaceId: place.providerPlaceId ?? null,
      travelTimes,
    });
  }

  candidates.sort((a, b) => {
    const gapA = Math.max(...a.travelTimes.map((t) => t.durationMinutes)) - Math.min(...a.travelTimes.map((t) => t.durationMinutes));
    const gapB = Math.max(...b.travelTimes.map((t) => t.durationMinutes)) - Math.min(...b.travelTimes.map((t) => t.durationMinutes));
    if (gapA !== gapB) return gapA - gapB;
    const maxA = Math.max(...a.travelTimes.map((t) => t.durationMinutes));
    const maxB = Math.max(...b.travelTimes.map((t) => t.durationMinutes));
    if (maxA !== maxB) return maxA - maxB;
    const avgA = a.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / a.travelTimes.length;
    const avgB = b.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / b.travelTimes.length;
    return avgA - avgB;
  });

  const topCandidates = candidates.slice(0, 3);

  const persisted = await prisma.$transaction(async (tx) => {
    await tx.placeCandidate.deleteMany({ where: { meetingId, votes: { none: {} } } });
    const created: Array<{
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      category: string;
      providerPlaceId: string | null;
      recommendationRank: number;
      travelTimes: typeof candidates[number]["travelTimes"];
    }> = [];
    for (let i = 0; i < topCandidates.length; i += 1) {
      const c = topCandidates[i]!;
      const candidate = await tx.placeCandidate.create({
        data: {
          meetingId,
          name: c.name,
          address: c.address,
          latitude: c.latitude,
          longitude: c.longitude,
          category: c.category,
          providerPlaceId: c.providerPlaceId,
          recommendationRank: i + 1,
          travelEstimates: {
            create: c.travelTimes.map((t) => ({
              userId: t.userId,
              durationMinutes: t.durationMinutes,
              distanceMeters: t.distanceMeters,
            })),
          },
        },
        include: { travelEstimates: { include: { user: { select: { id: true, nickname: true } } } } },
      });
      created.push({
        id: candidate.id,
        name: candidate.name,
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        category: candidate.category,
        providerPlaceId: candidate.providerPlaceId,
        recommendationRank: candidate.recommendationRank ?? i + 1,
        travelTimes: candidate.travelEstimates.map((e) => ({
          userId: e.userId,
          nickname: e.user.nickname,
          durationMinutes: e.durationMinutes,
          distanceMeters: e.distanceMeters,
        })),
      });
    }
    return created;
  });

  const inputHash = computeInputHash(meeting, origins);
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      recommendationsGeneratedAt: new Date(),
      recommendationsInputHash: inputHash,
      recommendationsVersion: { increment: 1 },
    },
  });

  return persisted.map((c) => {
    const times = c.travelTimes.map((t) => t.durationMinutes);
    const gap = Math.max(...times) - Math.min(...times);
    const max = Math.max(...times);
    return {
      id: c.id,
      providerPlaceId: c.providerPlaceId,
      name: c.name,
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      category: c.category,
      recommendationRank: c.recommendationRank,
      averageDurationMinutes: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      maximumDurationMinutes: max,
      timeGapMinutes: gap,
      fairnessScore: fairnessScore(gap, max),
      participantTravelTimes: c.travelTimes,
    };
  });
}

export async function generateMidpointRecommendations(
  meetingId: string,
  requesterId: string,
): Promise<{ midpoint: { latitude: number; longitude: number }; recommendations: MeetingRecommendation[] }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { user: { select: { id: true, nickname: true, homeLatitude: true, homeLongitude: true } } } },
      placeCandidates: { include: { votes: true, travelEstimates: { include: { user: { select: { id: true, nickname: true } } } } } },
    },
  });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
  const isParticipant = meeting.participants.some((p) => p.userId === requesterId);
  if (!isParticipant) throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");

  const origins: Array<{ userId: string; nickname: string; latitude: number; longitude: number }> = [];
  for (const p of meeting.participants) {
    let lat: number | null = null;
    let lng: number | null = null;
    if (p.originLatitude != null && p.originLongitude != null) {
      lat = p.originLatitude;
      lng = p.originLongitude;
    } else if (p.user.homeLatitude != null && p.user.homeLongitude != null) {
      lat = p.user.homeLatitude;
      lng = p.user.homeLongitude;
    }
    if (lat != null && lng != null) {
      origins.push({ userId: p.userId, nickname: p.user.nickname, latitude: lat, longitude: lng });
    }
  }
  if (origins.length !== 2) {
    const missing = meeting.participants
      .filter((p) => {
        const hasOrigin = p.originLatitude != null && p.originLongitude != null;
        const hasHome = p.user.homeLatitude != null && p.user.homeLongitude != null;
        return !hasOrigin && !hasHome;
      })
      .map((p) => p.userId);
    throw new AppError(409, "MIDPOINT_REQUIRES_TWO_ORIGINS", "Midpoint recommendations require exactly two participants with origins.", {
      missingParticipantIds: missing,
    } as unknown as Record<string, unknown>);
  }

  const midpoint = midpointOf(origins[0]!, origins[1]!);

  let query = meeting.title || "맛집";
  try {
    const rev = await reverseGeocode(midpoint.latitude, midpoint.longitude);
    const token = rev.roadAddress || rev.address;
    if (token) {
      const first = token.split(" ").slice(0, 2).join(" ").trim();
      if (first) query = first;
    }
  } catch {
  }

  const kakaoPlaces2 = await searchNearbyKakaoPlaces({
    query,
    latitude: midpoint.latitude,
    longitude: midpoint.longitude,
    radiusMeters: 3000,
  });
  const places = kakaoPlaces2.map((p) => ({
    title: p.name,
    address: p.address,
    roadAddress: p.address,
    category: p.category,
    latitude: p.latitude,
    longitude: p.longitude,
    providerPlaceId: p.id,
  }));

  const candidates: Array<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    category: string;
    providerPlaceId: string | null;
    travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
  }> = [];

  for (const place of places.slice(0, 12)) {
    const originTasks = origins.map((origin) => async () => {
      if (meeting.travelMetric === "DISTANCE") {
        const dist = Math.round(
          haversineDistance({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: place.latitude, longitude: place.longitude }),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 4.5) * 60));
        return { userId: origin.userId, nickname: origin.nickname, durationMinutes: duration, distanceMeters: dist, skip: false as const };
      }
      try {
        const result = await estimateRoute(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: place.latitude, longitude: place.longitude },
          meeting.travelMetric,
        );
        return {
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: result.durationMinutes,
          distanceMeters: result.distanceMeters,
          skip: false as const,
        };
      } catch (caught) {
        const code = caught instanceof AppError ? (caught as AppError).code : "";
        if (meeting.travelMetric === "TRANSIT") {
          if (code === "TRANSIT_NOT_CONFIGURED" || code === "TRANSIT_API_ERROR" || code === "TRANSIT_TIMEOUT" || code === "TRANSIT_FAILED") {
            throw caught;
          }
          if (code === "TRANSIT_NO_ROUTE") {
            return { skip: true as const };
          }
        }
        const dist = Math.round(
          haversineDistance({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: place.latitude, longitude: place.longitude }),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 30) * 60));
        return { userId: origin.userId, nickname: origin.nickname, durationMinutes: duration, distanceMeters: dist, skip: false as const };
      }
    });
    const results = await runWithLimit(originTasks, ROUTE_CONCURRENCY);
    if (results.some((r) => r.skip)) continue;
    const travelTimes = results as Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
    candidates.push({
      name: place.title,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
      providerPlaceId: null,
      travelTimes,
    });
  }

  candidates.sort((a, b) => {
    const gapA = Math.max(...a.travelTimes.map((t) => t.durationMinutes)) - Math.min(...a.travelTimes.map((t) => t.durationMinutes));
    const gapB = Math.max(...b.travelTimes.map((t) => t.durationMinutes)) - Math.min(...b.travelTimes.map((t) => t.durationMinutes));
    if (gapA !== gapB) return gapA - gapB;
    const maxA = Math.max(...a.travelTimes.map((t) => t.durationMinutes));
    const maxB = Math.max(...b.travelTimes.map((t) => t.durationMinutes));
    if (maxA !== maxB) return maxA - maxB;
    const avgA = a.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / a.travelTimes.length;
    const avgB = b.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / b.travelTimes.length;
    return avgA - avgB;
  });

  const topCandidates = candidates.slice(0, 3);

  const persisted = await prisma.$transaction(async (tx) => {
    await tx.placeCandidate.deleteMany({ where: { meetingId, votes: { none: {} } } });
    const created: Array<{
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      category: string;
      providerPlaceId: string | null;
      recommendationRank: number;
      travelTimes: typeof candidates[number]["travelTimes"];
    }> = [];
    for (let i = 0; i < topCandidates.length; i += 1) {
      const c = topCandidates[i]!;
      const candidate = await tx.placeCandidate.create({
        data: {
          meetingId,
          name: c.name,
          address: c.address,
          latitude: c.latitude,
          longitude: c.longitude,
          category: c.category,
          providerPlaceId: c.providerPlaceId,
          recommendationRank: i + 1,
          travelEstimates: {
            create: c.travelTimes.map((t) => ({
              userId: t.userId,
              durationMinutes: t.durationMinutes,
              distanceMeters: t.distanceMeters,
            })),
          },
        },
        include: { travelEstimates: { include: { user: { select: { id: true, nickname: true } } } } },
      });
      created.push({
        id: candidate.id,
        name: candidate.name,
        address: candidate.address,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        category: candidate.category,
        providerPlaceId: candidate.providerPlaceId,
        recommendationRank: candidate.recommendationRank ?? i + 1,
        travelTimes: candidate.travelEstimates.map((e) => ({
          userId: e.userId,
          nickname: e.user.nickname,
          durationMinutes: e.durationMinutes,
          distanceMeters: e.distanceMeters,
        })),
      });
    }
    return created;
  });

  const inputHash = computeInputHash(meeting, origins);
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      recommendationsGeneratedAt: new Date(),
      recommendationsInputHash: inputHash,
      recommendationsVersion: { increment: 1 },
    },
  });

  const recommendations: MeetingRecommendation[] = persisted.map((c) => {
    const times = c.travelTimes.map((t) => t.durationMinutes);
    return {
      id: c.id,
      providerPlaceId: c.providerPlaceId,
      name: c.name,
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      category: c.category,
      recommendationRank: c.recommendationRank,
      averageDurationMinutes: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      maximumDurationMinutes: Math.max(...times),
      timeGapMinutes: Math.max(...times) - Math.min(...times),
      fairnessScore: fairnessScore(Math.max(...times) - Math.min(...times), Math.max(...times)),
      participantTravelTimes: c.travelTimes,
    };
  });

  return { midpoint, recommendations };
}
