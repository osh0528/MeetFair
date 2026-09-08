export interface Coordinate {
  latitude: number;
  longitude: number;
}

export function meetingCentroid(coordinates: Coordinate[]): Coordinate {
  if (coordinates.length === 0) throw new Error("At least one coordinate is required.");

  return {
    latitude: coordinates.reduce((sum, point) => sum + point.latitude, 0) / coordinates.length,
    longitude: coordinates.reduce((sum, point) => sum + point.longitude, 0) / coordinates.length,
  };
}
