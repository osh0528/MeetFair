// Pure geographic helpers. No logging of coordinates anywhere (contract §11).

export const ARRIVAL_RADIUS_METERS = 100;
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

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Midpoint uses average; accurate within meters for spans <500km (Korea scope).
 * Unwraps longitudes when points straddle the antimeridian.
 */
export function midpointOf(a: GeoPoint, b: GeoPoint): GeoPoint {
  const lat = (a.latitude + b.latitude) / 2;
  let lng = (a.longitude + b.longitude) / 2;
  if (Math.abs(a.longitude - b.longitude) > 180) {
    const aLng = a.longitude < 0 ? a.longitude + 360 : a.longitude;
    const bLng = b.longitude < 0 ? b.longitude + 360 : b.longitude;
    lng = (aLng + bLng) / 2;
    if (lng > 180) lng -= 360;
  }
  return { latitude: lat, longitude: lng };
}

export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  return distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}
