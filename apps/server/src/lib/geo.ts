// Pure geographic helpers. No logging of coordinates anywhere (contract §11).

export const ARRIVAL_RADIUS_METERS = 500;
export const REQUIRED_PROXIMITY_HITS = 2;

export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Proximity counter resets whenever a sample falls outside the radius. */
export function nextProximityCount(previous: number, withinRadius: boolean): number {
  return withinRadius ? previous + 1 : 0;
}

export function hasConsecutivelyArrived(proximityCount: number): boolean {
  return proximityCount >= REQUIRED_PROXIMITY_HITS;
}
