export interface OpenStreetMapPoint {
  latitude: number;
  longitude: number;
  label: string;
}

export interface OpenStreetMapRoute {
  color?: string;
  points: Array<{ latitude: number; longitude: number }>;
}

export function buildOpenStreetMapHtml(points: OpenStreetMapPoint[], routes: OpenStreetMapRoute[] = []): string {
  const validPoints = points.filter((point) =>
    Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
  const displayPoints = validPoints.length
    ? validPoints
    : [{ latitude: 37.5665, longitude: 126.978, label: "서울" }];
  const serializedPoints = JSON.stringify(displayPoints).replace(/</g, "\\u003c");
  const serializedRoutes = JSON.stringify(routes).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html,body,#map{width:100%;height:100%;margin:0}body{background:#f5f5f5}.leaflet-tooltip{font-family:sans-serif;font-weight:700}</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const points = ${serializedPoints};
    const routes = ${serializedRoutes};
    const map = L.map("map", { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    const bounds = [];
    points.forEach((point) => {
      const position = [point.latitude, point.longitude];
      bounds.push(position);
      const label = document.createElement("span");
      label.textContent = point.label;
      L.marker(position).addTo(map).bindTooltip(label, {
        permanent: true,
        direction: "top",
        offset: [0, -10]
      });
    });
    routes.forEach((route, index) => {
      if (!route.points || route.points.length < 2) return;
      const path = route.points.map((point) => [point.latitude, point.longitude]);
      L.polyline(path, {
        color: route.color || ["#2563EB", "#7C3AED", "#059669", "#EA580C"][index % 4],
        weight: 5,
        opacity: 0.78,
        dashArray: route.dashed ? "10 8" : undefined
      }).addTo(map);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    else map.setView(bounds[0], 15);
  </script>
</body>
</html>`;
}
