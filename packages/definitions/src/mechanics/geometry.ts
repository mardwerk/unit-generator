export interface Point {
  x: number;
  y: number;
}
export interface Obstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const EPS = 1e-8;
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function linePoint(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const length = distance(a, b);
  if (length < EPS) return { along: 0, across: distance(p, a) };
  return {
    along: ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length,
    across: Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length
  };
}
export function blocked(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacles: Obstacle[]
) {
  return obstacles.some((o) => {
    const rx = b.x - a.x,
      ry = b.y - a.y,
      sx = o.x2 - o.x1,
      sy = o.y2 - o.y1;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < EPS) {
      if (Math.abs((o.x1 - a.x) * ry - (o.y1 - a.y) * rx) > EPS) return false;
      const length = distance(a, b);
      if (length < EPS) return false;
      const p = linePoint({ x: o.x1, y: o.y1 }, a, b).along;
      const q = linePoint({ x: o.x2, y: o.y2 }, a, b).along;
      return Math.max(p, q) >= 0 && Math.min(p, q) <= length;
    }
    const t = ((o.x1 - a.x) * sy - (o.y1 - a.y) * sx) / denominator;
    const u = ((o.x1 - a.x) * ry - (o.y1 - a.y) * rx) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  });
}
