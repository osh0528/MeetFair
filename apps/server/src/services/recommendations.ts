import type { MeetingRecommendation, TravelMetric } from "@meetfair/shared";
import { AppError } from "../lib/app-error.js";
import { searchNearbyKakaoPlaces, type KakaoPlace } from "../lib/kakao-local.js";
import { getDrivingDirections } from "../lib/naver-maps.js";
import { getTransitDirections } from "../lib/kakao-transit.js";
import { prisma } from "../lib/prisma.js";
import { meetingIncenter } from "./meeting-center.js";

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
    const latitude = participant.originLatitude ?? participant.user.homeLatitude;
    const longitude = participant.originLongitude ?? participant.user.homeLongitude;
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
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "異붿쿇??諛쏆쑝?ㅻ㈃ ?꾩튂瑜??ㅼ젙??李멸??먭? 2紐??댁긽 ?꾩슂?⑸땲??");
  }
  if (origins.length !== meeting.participants.length) {
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "紐⑤뱺 李멸??먭? 異쒕컻 ?꾩튂瑜??ㅼ젙????異붿쿇??諛쏆븘二쇱꽭??");
  }

  const center = meetingIncenter(origins);
  // 3紐??댁긽? ?⑥씪 ?댁떖留?寃?됲븯吏 ?딄퀬 ?щ윭 以묒떖???먯깋?????ㅼ젣 ?대룞?쒓컙?쇰줈 寃곗젙?⑸땲??
  const searchCenters = origins.length > 2
    ? [
        center,
        {
          latitude: origins.reduce((sum, origin) => sum + origin.latitude, 0) / origins.length,
          longitude: origins.reduce((sum, origin) => sum + origin.longitude, 0) / origins.length,
        },
        ...origins.map(({ latitude, longitude }) => ({ latitude, longitude })),
      ]
    : [center];
  const queries = meeting.categories.length ? meeting.categories : ["카페", "음식점"];
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
  const nearbyPlaces = [...uniquePlaces.values()]
    .sort((a, b) => {
      const nearestA = Math.min(...searchCenters.map((point) => distanceMeters(point, a)));
      const nearestB = Math.min(...searchCenters.map((point) => distanceMeters(point, b)));
      return nearestA - nearestB;
    })
    .slice(0, MAX_ROUTE_CANDIDATES);
  if (!nearbyPlaces.length) {
    throw new AppError(404, "RECOMMENDATION_PLACES_NOT_FOUND", "以묒떖 ?꾩튂 二쇰??먯꽌 異붿쿇???μ냼瑜?李얠? 紐삵뻽?듬땲??");
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
