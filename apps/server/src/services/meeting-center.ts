export interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Point {
  x: number;
  y: number;
}

const EPSILON = 1e-10;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter((point, index) => index === 0
    || Math.abs(point.x - sorted[index - 1]!.x) > EPSILON
    || Math.abs(point.y - sorted[index - 1]!.y) > EPSILON);
  if (unique.length <= 2) return unique;

  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= EPSILON) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= EPSILON) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function triangleIncenter(a: Point, b: Point, c: Point): Point {
  const sideA = distance(b, c);
  const sideB = distance(a, c);
  const sideC = distance(a, b);
  const perimeter = sideA + sideB + sideC;
  if (perimeter <= EPSILON) return a;
  return {
    x: (sideA * a.x + sideB * b.x + sideC * c.x) / perimeter,
    y: (sideA * a.y + sideB * b.y + sideC * c.y) / perimeter,
  };
}

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function polygonClearance(point: Point, polygon: Point[]): number {
  return Math.min(...polygon.map((vertex, index) =>
    pointToSegmentDistance(point, vertex, polygon[(index + 1) % polygon.length]!)));
}

function polygonIncenter(points: Point[]): Point {
  const hull = convexHull(points);
  if (hull.length === 1) return hull[0]!;
  if (hull.length === 2) {
    return { x: (hull[0]!.x + hull[1]!.x) / 2, y: (hull[0]!.y + hull[1]!.y) / 2 };
  }
  if (hull.length === 3) return triangleIncenter(hull[0]!, hull[1]!, hull[2]!);

  let best = {
    x: hull.reduce((sum, point) => sum + point.x, 0) / hull.length,
    y: hull.reduce((sum, point) => sum + point.y, 0) / hull.length,
  };
  let bestClearance = polygonClearance(best, hull);
  const minX = Math.min(...hull.map((point) => point.x));
  const maxX = Math.max(...hull.map((point) => point.x));
  const minY = Math.min(...hull.map((point) => point.y));
  const maxY = Math.max(...hull.map((point) => point.y));
  let step = Math.max(maxX - minX, maxY - minY) / 2;
  const directions = [-1, 0, 1];
  while (step > 1e-8) {
    let improved = false;
    for (const dx of directions) {
      for (const dy of directions) {
        if (dx === 0 && dy === 0) continue;
        const candidate = { x: best.x + dx * step, y: best.y + dy * step };
        const candidateClearance = polygonClearance(candidate, hull);
        const inside = hull.every((point, index) =>
          cross(point, hull[(index + 1) % hull.length]!, candidate) >= -EPSILON);
        if (inside && candidateClearance > bestClearance) {
          best = candidate;
          bestClearance = candidateClearance;
          improved = true;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return best;
}

function triangleCircumcenter(a: Point, b: Point, c: Point): Point | null {
  const divisor = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(divisor) <= EPSILON) return null;
  const aSquared = a.x * a.x + a.y * a.y;
  const bSquared = b.x * b.x + b.y * b.y;
  const cSquared = c.x * c.x + c.y * c.y;
  return {
    x: (aSquared * (b.y - c.y) + bSquared * (c.y - a.y) + cSquared * (a.y - b.y)) / divisor,
    y: (aSquared * (c.x - b.x) + bSquared * (a.x - c.x) + cSquared * (b.x - a.x)) / divisor,
  };
}

function minimumEnclosingCircleCenter(points: Point[]): Point {
  if (points.length === 1) return points[0]!;
  const centers: Point[] = [...points];
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      centers.push({
        x: (points[first]!.x + points[second]!.x) / 2,
        y: (points[first]!.y + points[second]!.y) / 2,
      });
      for (let third = second + 1; third < points.length; third += 1) {
        const center = triangleCircumcenter(points[first]!, points[second]!, points[third]!);
        if (center) centers.push(center);
      }
    }
  }

  return centers.reduce((best, center) => {
    const radius = Math.max(...points.map((point) => distance(center, point)));
    return radius < best.radius ? { point: center, radius } : best;
  }, { point: points[0]!, radius: Number.POSITIVE_INFINITY }).point;
}

export function meetingCentroid(coordinates: Coordinate[]): Coordinate {
  if (coordinates.length === 0) throw new Error("At least one coordinate is required.");

  return {
    latitude: coordinates.reduce((sum, point) => sum + point.latitude, 0) / coordinates.length,
    longitude: coordinates.reduce((sum, point) => sum + point.longitude, 0) / coordinates.length,
  };
}

export function meetingCenters(coordinates: Coordinate[]): {
  incenter: Coordinate;
  centroid: Coordinate;
  circumcenter: Coordinate;
} {
  if (coordinates.length === 0) throw new Error("At least one coordinate is required.");

  const centroid = meetingCentroid(coordinates);
  const longitudeScale = Math.max(Math.cos((centroid.latitude * Math.PI) / 180), 1e-6);
  const points = coordinates.map((coordinate) => ({
    x: coordinate.longitude * longitudeScale,
    y: coordinate.latitude,
  }));
  const toCoordinate = (point: Point): Coordinate => ({
    latitude: point.y,
    longitude: point.x / longitudeScale,
  });
  const triangleOuterCenter = points.length === 3
    ? triangleCircumcenter(points[0]!, points[1]!, points[2]!)
    : null;

  return {
    incenter: toCoordinate(polygonIncenter(points)),
    centroid,
    circumcenter: toCoordinate(triangleOuterCenter ?? minimumEnclosingCircleCenter(points)),
  };
}
