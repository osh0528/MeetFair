import { prisma } from "../lib/prisma.js";
import { distanceMeters, nextProximityCount, hasConsecutivelyArrived } from "../lib/geo.js";

export interface ArrivalResult {
  arrived: boolean;
  proximityCount: number;
  withinRadius: boolean;
}

export async function recordProximitySample(
  participantId: string,
  place: { latitude: number; longitude: number } | null,
  latitude: number,
  longitude: number,
  _now: Date = new Date(),
): Promise<ArrivalResult> {
  const participant = await prisma.meetingParticipant.findUnique({ where: { id: participantId } });
  if (!participant) throw new Error("Participant not found");
  const withinRadius = place ? distanceMeters(latitude, longitude, place.latitude, place.longitude) <= 100 : false;
  const proximityCount = nextProximityCount(participant.arrivalProximityCount, withinRadius);
  const arrived = hasConsecutivelyArrived(proximityCount);
  return { arrived, proximityCount, withinRadius };
}
