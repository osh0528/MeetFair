import type { MeetingRecommendation } from "@meetfair/shared";
import { AppError } from "../lib/app-error.js";
import { searchNearbyKakaoPlaces, type KakaoPlace } from "../lib/kakao-local.js";
import { getDrivingDirections } from "../lib/naver-maps.js";
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

function metrics(candidate: CandidateWithTravel) {
  const times = candidate.travelTimes.map((travel) => travel.durationMinutes);
  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  return {
    average,
    maximum: Math.max(...times),
    gap: Math.max(...times) - Math.min(...times),
  };
}

export function rankRecommendationCandidates(candidates: CandidateWithTravel[]): CandidateWithTravel[] {
  return [...candidates].sort((a, b) => {
    const metricA = metrics(a);
    const metricB = metrics(b);
    return metricA.gap - metricB.gap
      || metricA.maximum - metricB.maximum
      || metricA.average - metricB.average
      || a.distanceMeters - b.distanceMeters;
  });
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
    participantTravelTimes: candidate.travelEstimates.map((estimate) => ({
      userId: estimate.userId,
      nickname: estimate.user.nickname,
      durationMinutes: estimate.durationMinutes,
      distanceMeters: estimate.distanceMeters,
    })),
  };
}

export async function generateRecommendations(meetingId: string, requesterId: string): Promise<MeetingRecommendation[]> {
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
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "추천을 받으려면 위치를 설정한 참가자가 2명 이상 필요합니다.");
  }
  if (origins.length !== meeting.participants.length) {
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "모든 참가자가 출발 위치를 설정한 뒤 추천을 받아주세요.");
  }

  const center = meetingIncenter(origins);
  const queries = meeting.categories.length ? meeting.categories : ["카페", "음식점"];
  const searchResults = await Promise.all(queries.map((query) => searchNearbyKakaoPlaces({
    query,
    latitude: center.latitude,
    longitude: center.longitude,
    radiusMeters: 3000,
  })));
  const uniquePlaces = new Map<string, KakaoPlace>();
  for (const place of searchResults.flat()) {
    if (!uniquePlaces.has(place.id)) uniquePlaces.set(place.id, place);
  }
  const nearbyPlaces = [...uniquePlaces.values()]
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 5);
  if (!nearbyPlaces.length) {
    throw new AppError(404, "RECOMMENDATION_PLACES_NOT_FOUND", "중심 위치 주변에서 추천할 장소를 찾지 못했습니다.");
  }

  const tasks = nearbyPlaces.flatMap((place) => origins.map((origin) => ({ place, origin })));
  const estimates = await mapWithConcurrency(tasks, 5, async ({ place, origin }) => {
    try {
      const route = await getDrivingDirections(origin, place);
      return {
        placeId: place.id,
        userId: origin.userId,
        nickname: origin.nickname,
        durationMinutes: route.durationMinutes,
        distanceMeters: route.distanceMeters,
      };
    } catch {
      const distance = distanceMeters(origin, place);
      return {
        placeId: place.id,
        userId: origin.userId,
        nickname: origin.nickname,
        durationMinutes: Math.max(1, Math.round((distance / 1000 / 30) * 60)),
        distanceMeters: distance,
      };
    }
  });

  const candidates = rankRecommendationCandidates(nearbyPlaces.map((place) => ({
    ...place,
    providerPlaceId: `kakao:${place.id}`,
    travelTimes: estimates
      .filter((estimate) => estimate.placeId === place.id)
      .map(({ placeId: _placeId, ...estimate }) => estimate),
  })));

  const persisted = await prisma.$transaction(async (transaction) => {
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
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
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
