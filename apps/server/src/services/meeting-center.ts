export interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function triangleIncenter(points: Point[]): Point {
  const [a, b, c] = points as [Point, Point, Point];
  const weightA = distance(b, c);
  const weightB = distance(a, c);
  const weightC = distance(a, b);
  const total = weightA + weightB + weightC;
  if (total === 0) return a;
  return {
    x: (weightA * a.x + weightB * b.x + weightC * c.x) / total,
    y: (weightA * a.y + weightB * b.y + weightC * c.y) / total,
  };
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter((point, index) => index === 0 || point.x !== sorted[index - 1]?.x || point.y !== sorted[index - 1]?.y);
  if (unique.length <= 2) return unique;

  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return distance(point, { x: start.x + ratio * dx, y: start.y + ratio * dy });
}

function isInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]!;
    const b = polygon[previous]!;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function clearance(point: Point, polygon: Point[]): number {
  if (!isInsidePolygon(point, polygon)) return Number.NEGATIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!));
  }
  return minimum;
}

function largestInscribedCircleCenter(polygon: Point[]): Point {
  let best = {
    x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
  };
  let bestClearance = clearance(best, polygon);
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  let step = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;

  while (step > 0.00000001) {
    let improved = false;
    for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const candidate = { x: best.x + dx! * step, y: best.y + dy! * step };
      const candidateClearance = clearance(candidate, polygon);
      if (candidateClearance > bestClearance) {
        best = candidate;
        bestClearance = candidateClearance;
        improved = true;
      }
    }
    if (!improved) step /= 2;
  }
  return best;
}

export function meetingIncenter(coordinates: Coordinate[]): Coordinate {
  if (coordinates.length === 0) throw new Error("At least one coordinate is required.");
  if (coordinates.length === 1) return coordinates[0]!;

  const meanLatitude = coordinates.reduce((sum, point) => sum + point.latitude, 0) / coordinates.length;
  const longitudeScale = Math.cos((meanLatitude * Math.PI) / 180);
  const points = coordinates.map((point) => ({ x: point.longitude * longitudeScale, y: point.latitude }));
  const hull = convexHull(points);
  let center: Point;
  if (hull.length === 1) {
    center = hull[0]!;
  } else if (hull.length === 2) {
    center = { x: (hull[0]!.x + hull[1]!.x) / 2, y: (hull[0]!.y + hull[1]!.y) / 2 };
  } else if (hull.length === 3) {
    center = triangleIncenter(hull);
  } else {
    center = largestInscribedCircleCenter(hull);
  }
  return { latitude: center.y, longitude: center.x / longitudeScale };
}
