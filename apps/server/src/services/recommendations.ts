import { AppError } from "../lib/app-error.js";
import { midpointOf } from "../lib/geo.js";
import { getDrivingDirections, reverseGeocode } from "../lib/naver-maps.js";
import { searchLocalPlaces } from "../lib/naver-search.js";
import { prisma } from "../lib/prisma.js";
import type { MeetingRecommendation } from "@meetfair/shared";

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
    throw new AppError(409, "MEETING_ORIGINS_INCOMPLETE", "At least two participants need origins for recommendations.");
  }

  const query = meeting.title || "맛집";
  const places = await searchLocalPlaces(query);

  const candidates: Array<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    category: string;
    providerPlaceId: string | null;
    travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
  }> = [];

  for (const place of places.slice(0, 5)) {
    const travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }> = [];
    for (const origin of origins) {
      try {
        const result = await getDrivingDirections(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: place.latitude, longitude: place.longitude },
        );
        travelTimes.push({
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: result.durationMinutes,
          distanceMeters: result.distanceMeters,
        });
      } catch {
        const dist = Math.round(
          6371000 *
            2 *
            Math.asin(
              Math.sqrt(
                Math.sin(((place.latitude - origin.latitude) * Math.PI) / 360) ** 2 +
                  Math.cos((origin.latitude * Math.PI) / 180) *
                    Math.cos((place.latitude * Math.PI) / 180) *
                    Math.sin(((place.longitude - origin.longitude) * Math.PI) / 360) ** 2,
              ),
            ),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 30) * 60));
        travelTimes.push({
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: duration,
          distanceMeters: dist,
        });
      }
    }
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
    const avgA = a.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / a.travelTimes.length;
    const avgB = b.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / b.travelTimes.length;
    return avgA - avgB;
  });

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
    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i]!;
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

  return persisted.map((c) => {
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
    throw new AppError(409, "MIDPOINT_REQUIRES_TWO_ORIGINS", "Midpoint recommendations require exactly two participants with origins.");
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

  const places = await searchLocalPlaces(query);

  const candidates: Array<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    category: string;
    providerPlaceId: string | null;
    travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }>;
  }> = [];

  for (const place of places.slice(0, 5)) {
    const travelTimes: Array<{ userId: string; nickname: string; durationMinutes: number; distanceMeters: number }> = [];
    for (const origin of origins) {
      try {
        const result = await getDrivingDirections(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: place.latitude, longitude: place.longitude },
        );
        travelTimes.push({
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: result.durationMinutes,
          distanceMeters: result.distanceMeters,
        });
      } catch {
        const dist = Math.round(
          6371000 *
            2 *
            Math.asin(
              Math.sqrt(
                Math.sin(((place.latitude - origin.latitude) * Math.PI) / 360) ** 2 +
                  Math.cos((origin.latitude * Math.PI) / 180) *
                    Math.cos((place.latitude * Math.PI) / 180) *
                    Math.sin(((place.longitude - origin.longitude) * Math.PI) / 360) ** 2,
              ),
            ),
        );
        const duration = Math.max(1, Math.round((dist / 1000 / 30) * 60));
        travelTimes.push({
          userId: origin.userId,
          nickname: origin.nickname,
          durationMinutes: duration,
          distanceMeters: dist,
        });
      }
    }
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
    const avgA = a.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / a.travelTimes.length;
    const avgB = b.travelTimes.reduce((s, t) => s + t.durationMinutes, 0) / b.travelTimes.length;
    return avgA - avgB;
  });

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
    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i]!;
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
      participantTravelTimes: c.travelTimes,
    };
  });

  return { midpoint, recommendations };
}
