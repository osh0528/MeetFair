import type { MeetingRecommendation, TravelMetric } from "@meetfair/shared";
import { AppError } from "../lib/app-error.js";
import { searchNearbyKakaoPlaces, type KakaoPlace } from "../lib/kakao-local.js";
import { getDrivingDirections } from "../lib/naver-maps.js";
import { getTransitDirections } from "../lib/kakao-transit.js";
import { prisma } from "../lib/prisma.js";
import { meetingCentroid } from "./meeting-center.js";

interface Origin {
  userId: string;
  nickname: string;
  latitude: number;
  longitude: number;
}

interface CandidateWithTravel extends KakaoPlace {
  providerPlaceId: string;
  travelTimes: Array<{
    userId: string;
    nickname: string;
    durationMinutes: number;
    distanceMeters: number;
  }>;
}

interface CachedRouteResult {
  expiresAt: number;
  value: { durationMinutes: number; distanceMeters: number };
}

interface EstimatedRoute {
  placeId: string;
  userId: string;
  nickname: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  error: unknown;
}

const routeCache = new Map<string, CachedRouteResult>();
const routeJobs = new Map<string, Promise<CachedRouteResult["value"]>>();
const recommendationJobs = new Map<string, Promise<MeetingRecommendation[]>>();
const ROUTE_CACHE_TTL_MS = 2 * 60_000;
const MAX_ROUTE_CANDIDATES = 24;
const MAX_ROUTE_ESTIMATES = 120;
const MAX_SEARCH_CENTERS = 6;
const MAX_SEARCH_QUERIES = 3;

function distanceMeters(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): number {
  return Math.round(
    6371000 *
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(((destination.latitude - origin.latitude) * Math.PI) / 360) ** 2 +
            Math.cos((origin.latitude * Math.PI) / 180) *
              Math.cos((destination.latitude * Math.PI) / 180) *
              Math.sin(((destination.longitude - origin.longitude) * Math.PI) / 360) ** 2,
        ),
      ),
  );
}

function routeCacheKey(travelMetric: TravelMetric, origin: Origin, destination: KakaoPlace): string {
  return [
    travelMetric,
    origin.latitude.toFixed(5),
    origin.longitude.toFixed(5),
    destination.latitude.toFixed(5),
    destination.longitude.toFixed(5),
  ].join(":");
}

async function cachedRouteDirections(travelMetric: TravelMetric, origin: Origin, destination: KakaoPlace) {
  const key = routeCacheKey(travelMetric, origin, destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) routeCache.delete(key);
  const running = routeJobs.get(key);
  if (running) return running;
  const job = (async () => {
    if (travelMetric === "DISTANCE") {
      const distance = distanceMeters(origin, destination);
      return {
        durationMinutes: Math.max(1, Math.round((distance / 1000 / 4.5) * 60)),
        distanceMeters: distance,
      };
    }
    return travelMetric === "TRANSIT"
      ? getTransitDirections(origin, destination)
      : getDrivingDirections(origin, destination);
  })();
  routeJobs.set(key, job);
  try {
    const value = await job;
    routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, value });
    if (routeCache.size > 500) {
      for (const [cacheKey, entry] of routeCache) {
        if (entry.expiresAt <= Date.now()) routeCache.delete(cacheKey);
      }
    }
    return value;
  } finally {
    routeJobs.delete(key);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function metrics(candidate: CandidateWithTravel, travelMetric: TravelMetric) {
  const values = candidate.travelTimes.map((travel) => travelMetric === "DISTANCE" ? travel.distanceMeters : travel.durationMinutes);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    average,
    maximum: Math.max(...values),
    gap: Math.max(...values) - Math.min(...values),
  };
}

export function rankRecommendationCandidates(candidates: CandidateWithTravel[], travelMetric: TravelMetric = "CAR"): CandidateWithTravel[] {
  return [...candidates].sort((a, b) => {
    const metricA = metrics(a, travelMetric);
    const metricB = metrics(b, travelMetric);
    return metricA.gap - metricB.gap
      || metricA.maximum - metricB.maximum
      || metricA.average - metricB.average
      || a.distanceMeters - b.distanceMeters;
  });
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

function summarizeExistingCandidate(candidate: {
  id: string;
  providerPlaceId: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  recommendationRank: number | null;
  travelEstimates: Array<{
    userId: string;
    durationMinutes: number;
    distanceMeters: number;
    user: { nickname: string };
  }>;
}): MeetingRecommendation {
  const times = candidate.travelEstimates.map((estimate) => estimate.durationMinutes);
  const averageDurationMinutes = times.length
    ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
    : 0;
  const maximumDurationMinutes = times.length ? Math.max(...times) : 0;
  const timeGapMinutes = times.length ? Math.max(...times) - Math.min(...times) : 0;
  return {
    id: candidate.id,
    providerPlaceId: candidate.providerPlaceId,
    name: candidate.name,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    category: candidate.category,
    recommendationRank: candidate.recommendationRank ?? 99,
    averageDurationMinutes,
    maximumDurationMinutes,
    timeGapMinutes,
    fairnessScore: fairnessScore(timeGapMinutes, maximumDurationMinutes),
    participantTravelTimes: candidate.travelEstimates.map((estimate) => ({
      userId: estimate.userId,
      nickname: estimate.user.nickname,
      durationMinutes: estimate.durationMinutes,
      distanceMeters: estimate.distanceMeters,
    })),
  };
}

async function generateRecommendationsInternal(meetingId: string, requesterId: string): Promise<MeetingRecommendation[]> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, nickname: true, homeLatitude: true, homeLongitude: true },
          },
        },
      },
      placeCandidates: {
        include: {
          votes: true,
          travelEstimates: {
            include: { user: { select: { nickname: true } } },
          },
        },
      },
    },
  });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
  if (!meeting.participants.some((participant) => participant.userId === requesterId)) {
    throw new AppError(403, "NOT_A_PARTICIPANT", "You are not a participant of this meeting.");
  }

  if (meeting.placeCandidates.some((candidate) => candidate.votes.length > 0)) {
    return meeting.placeCandidates.map(summarizeExistingCandidate);
  }

  const origins: Origin[] = meeting.participants.flatMap((participant) => {
    // Recommendations always use the latest profile home address. Meeting-specific
    // origins are intentionally excluded so changing a home address changes the result.
    const latitude = participant.user.homeLatitude;
    const longitude = participant.user.homeLongitude;
    return latitude != null && longitude != null
      ? [{
          userId: participant.userId,
          nickname: participant.user.nickname,
          latitude,
          longitude,
        }]
      : [];
  });
  if (origins.length < 2) {
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "추천을 받으려면 위치를 설정한 참가자가 2명 이상 필요합니다.");
  }
  if (origins.length !== meeting.participants.length) {
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "모든 참가자가 출발 위치를 설정한 후 추천을 받아주세요.");
  }

  const center = meetingCentroid(origins);
  // 3명 이상은 단일 중심만 검색하지 않고 여러 중심을 탐색한 뒤 실제 이동시간으로 결정합니다.
  const rawSearchCenters = origins.length > 2
    ? [
        center,
        {
          latitude: origins.reduce((sum, origin) => sum + origin.latitude, 0) / origins.length,
          longitude: origins.reduce((sum, origin) => sum + origin.longitude, 0) / origins.length,
        },
        ...origins.map(({ latitude, longitude }) => ({ latitude, longitude })),
      ]
    : [center];
  const searchCenters = rawSearchCenters
    .filter((point, index, points) => points.findIndex((candidate) =>
      candidate.latitude.toFixed(5) === point.latitude.toFixed(5)
      && candidate.longitude.toFixed(5) === point.longitude.toFixed(5)) === index)
    .filter((_, index, points) => index < 2 || index % Math.max(1, Math.ceil((points.length - 2) / (MAX_SEARCH_CENTERS - 2))) === 0)
    .slice(0, MAX_SEARCH_CENTERS);
  const queries = [...new Set(["지하철역", ...(meeting.categories.length ? meeting.categories : ["카페", "음식점"])])]
    .slice(0, MAX_SEARCH_QUERIES);
  const searchResults = await Promise.all(
    searchCenters.flatMap((searchCenter) => queries.map((query) => searchNearbyKakaoPlaces({
      query,
      latitude: searchCenter.latitude,
      longitude: searchCenter.longitude,
      radiusMeters: origins.length > 2 ? 5000 : 3000,
    }))),
  );
  const uniquePlaces = new Map<string, KakaoPlace>();
  for (const place of searchResults.flat()) {
    if (!uniquePlaces.has(place.id)) uniquePlaces.set(place.id, place);
  }
  const routeCandidateLimit = Math.max(2, Math.min(MAX_ROUTE_CANDIDATES, Math.floor(MAX_ROUTE_ESTIMATES / origins.length)));
  const nearbyPlaces = [...uniquePlaces.values()]
    .sort((a, b) => {
      const nearestA = Math.min(...searchCenters.map((point) => distanceMeters(point, a)));
      const nearestB = Math.min(...searchCenters.map((point) => distanceMeters(point, b)));
      return nearestA - nearestB;
    })
    .slice(0, routeCandidateLimit);
  if (!nearbyPlaces.length) {
    throw new AppError(404, "RECOMMENDATION_PLACES_NOT_FOUND", "중심 위치 주변에서 추천할 장소를 찾지 못했습니다.");
  }

  const tasks = nearbyPlaces.flatMap((place) => origins.map((origin) => ({ place, origin })));
  const estimates: EstimatedRoute[] = await mapWithConcurrency(tasks, 6, async ({ place, origin }) => {
    try {
      const route = await cachedRouteDirections(meeting.travelMetric, origin, place);
      return {
        placeId: place.id,
        userId: origin.userId,
        nickname: origin.nickname,
        durationMinutes: route.durationMinutes,
        distanceMeters: route.distanceMeters,
        error: null,
      };
    } catch (error) {
      if (meeting.travelMetric === "TRANSIT") {
        return {
          placeId: place.id,
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: null,
          distanceMeters: null,
          error,
        };
      }
      const distance = distanceMeters(origin, place);
      return {
        placeId: place.id,
        userId: origin.userId,
        nickname: origin.nickname,
        durationMinutes: Math.max(1, Math.round((distance / 1000 / 30) * 60)),
        distanceMeters: distance,
        error: null,
      };
    }
  });

  const candidates = rankRecommendationCandidates(nearbyPlaces.flatMap((place) => {
    const placeEstimates = estimates.filter((estimate) => estimate.placeId === place.id);
    if (placeEstimates.some((estimate) => estimate.durationMinutes == null || estimate.distanceMeters == null)) return [];
    return [{
      ...place,
      providerPlaceId: `kakao:${place.id}`,
      travelTimes: placeEstimates.map((estimate) => ({
        userId: estimate.userId,
        nickname: estimate.nickname,
        durationMinutes: estimate.durationMinutes!,
        distanceMeters: estimate.distanceMeters!,
      })),
    }];
  }), meeting.travelMetric);
  if (!candidates.length) {
    const routeError = estimates.find((estimate) => estimate.error)?.error;
    if (routeError instanceof AppError) throw routeError;
    throw new AppError(502, "TRANSIT_FAILED", "Public transit routes could not be calculated.");
  }

  const persisted = await prisma.$transaction(async (transaction) => {
  const topCandidates = candidates.slice(0, 2);

    await transaction.placeCandidate.deleteMany({
      where: {
        meetingId,
        votes: { none: {} },
        OR: [
          { providerPlaceId: { startsWith: "meetfair:center:" } },
          { providerPlaceId: { startsWith: "kakao:" } },
        ],
      },
    });

    const created = [];
    for (let index = 0; index < topCandidates.length; index += 1) {
      const candidate = topCandidates[index]!;
      created.push(await transaction.placeCandidate.create({
        data: {
          meetingId,
          name: candidate.name,
          address: candidate.address,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          category: candidate.category,
          providerPlaceId: candidate.providerPlaceId,
          recommendationRank: index + 1,
          travelEstimates: {
            create: candidate.travelTimes.map((travel) => ({
              userId: travel.userId,
              durationMinutes: travel.durationMinutes,
              distanceMeters: travel.distanceMeters,
            })),
          },
        },
        include: {
          travelEstimates: {
            include: { user: { select: { nickname: true } } },
          },
        },
      }));
    }
    return created;
  });

  const recommendationsInputHash = computeInputHash(meeting, origins);
  const now = new Date();
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      recommendationsGeneratedAt: now,
      recommendationsInputHash,
      recommendationsVersion: { increment: 1 },
    },
  });

  return persisted.map(summarizeExistingCandidate);
}

export async function generateRecommendations(meetingId: string, requesterId: string): Promise<MeetingRecommendation[]> {
  const existingJob = recommendationJobs.get(meetingId);
  if (existingJob) return existingJob;

  const job = generateRecommendationsInternal(meetingId, requesterId);
  recommendationJobs.set(meetingId, job);
  try {
    return await job;
  } finally {
    if (recommendationJobs.get(meetingId) === job) recommendationJobs.delete(meetingId);
  }
}

export async function generateMidpointRecommendations(
  meetingId: string,
  requesterId: string,
): Promise<{ midpoint: { latitude: number; longitude: number }; recommendations: MeetingRecommendation[] }> {
  const recommendations = await generateRecommendations(meetingId, requesterId);
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { participants: { include: { user: { select: { homeLatitude: true, homeLongitude: true } } } } },
  });
  if (!meeting) throw new AppError(404, "MEETING_NOT_FOUND", "Meeting was not found.");
  const origins = meeting.participants.flatMap((participant) => {
    const latitude = participant.user.homeLatitude;
    const longitude = participant.user.homeLongitude;
    return latitude != null && longitude != null ? [{ latitude, longitude }] : [];
  });
  if (origins.length < 2) {
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "At least two participants need origins for recommendations.");
  }
  const midpoint = meetingCentroid(origins);
  return { midpoint, recommendations };
}
