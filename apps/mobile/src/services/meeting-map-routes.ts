import type { MapDisplayMarker, MapDisplayRoute } from "../types/location";

export type MeetingRoutePayload = {
  userId: string;
  approximate: boolean;
  points: Array<{ latitude: number; longitude: number }>;
};

const ROUTE_COLORS = ["#2563EB", "#7C3AED", "#059669", "#EA580C"];

export function buildMeetingMapRoutes(
  routes: MeetingRoutePayload[],
  candidateId: string,
  nicknames: Map<string, string>,
): { mapRoutes: MapDisplayRoute[]; originMarkers: MapDisplayMarker[] } {
  const usable = routes.filter((route) => route.points.length > 1);
  return {
    mapRoutes: usable.map((route, index) => ({
      id: `route:home:${route.userId}:${candidateId}`,
      color: ROUTE_COLORS[index % ROUTE_COLORS.length],
      dashed: route.approximate,
      points: route.points,
    })),
    originMarkers: usable.map((route) => ({
      id: `route-origin:${route.userId}`,
      label: `${nicknames.get(route.userId) ?? "참가자"} 출발`,
      kind: "HOME",
      address: "출발 위치",
      latitude: route.points[0]!.latitude,
      longitude: route.points[0]!.longitude,
    })),
  };
}
