import { parcelHash, type Parcel } from "../engine/city";
import { suburbLayout } from "./suburbLayout";
import { streetFront } from "./frontagePlacement";

export interface GroundPoint { x: number; z: number; }
export interface GroundRect extends GroundPoint { w: number; d: number; }
export interface WalkingPath { points: GroundPoint[]; cumulative: number[]; length: number; }
export function walkingPath(points: GroundPoint[]): WalkingPath {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
}
/** Enter from the gate, pause inside, then return along the same path. */
export function sampleWalker(path: WalkingPath, phase: number, out: GroundPoint & { heading: number; visible: boolean }) {
  if (path.points.length < 2 || !path.length) { out.visible = false; return; }
  const t = ((phase % 1) + 1) % 1;
  const inbound = t < 0.4;
  out.visible = inbound || t >= 0.6;
  const distance = (inbound ? 1 - t / 0.4 : Math.max(0, (t - 0.6) / 0.4)) * path.length;
  let i = 1;
  while (i < path.points.length - 1 && path.cumulative[i] < distance) i++;
  const a = path.points[i - 1], b = path.points[i];
  const span = path.cumulative[i] - path.cumulative[i - 1];
  const f = span > 0 ? (distance - path.cumulative[i - 1]) / span : 0;
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f;
  out.heading = Math.atan2((b.x - a.x) * (inbound ? -1 : 1), (b.z - a.z) * (inbound ? -1 : 1));
}
export const WALK_WIDTH = 0.8;

export function overlaps(a: GroundRect, b: GroundRect, clearance = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + clearance - 0.00001 &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 + clearance - 0.00001;
}
export function insidePlot(r: GroundRect, p: Parcel) {
  return Math.abs(r.x) + r.w / 2 <= p.w / 2 + 0.00001 && Math.abs(r.z) + r.d / 2 <= p.d / 2 + 0.00001;
}

/** Ground-level obstacles from the same dimensions as the architecture.
 * Dense perimeter blocks have no new yard: their parcel remains occupied. */
export function groundObstacles(p: Parcel): GroundRect[] {
  const seed = parcelHash(p.id) >> 3;
  const rect = (w: number, d: number, x = 0, z = 0) => ({ x, z, w, d });
  switch (p.district) {
    case "centrum": return [rect(p.w, p.d)];
    case "innerstad": return [rect(p.w * 0.96, p.d * 0.96)];
    case "finans": { const s = seed % 2 === 0 ? 0.92 : 0.72; return [rect(p.w * s, p.d * s)]; }
    case "förort": { const layout = suburbLayout(p); return [...layout.houses, ...layout.trees.map(t => rect(0.9, 0.9, t.x, t.z))]; }
    case "hamnen": {
      const w = p.w * 0.9, d = p.d * 0.78;
      return [rect(w, d), ...(seed % 2 === 0 ? [rect(2.2, 1.9, w * 0.3 + 0.4, d / 2 + 1.6)] : [])];
    }
    case "industri": { const w = p.w * 0.92, d = p.d * 0.8; return [rect(w + 1, d + 1), rect(3.2, 3.2, -w * 0.34, d * 0.52)]; }
    default: {
      const w = p.w * 0.55, d = p.d * 0.55;
      return [rect(w, d), ...(seed % 3 === 0 ? [rect(w * 0.6, d * 0.75, -w * 0.68, d * 0.3)] : []),
        ...(seed % 2 === 0 ? [rect(4, 3.4, w * 0.85, -d * 0.5)] : [])];
    }
  }
}

export function pathRect(a: GroundPoint, b: GroundPoint): GroundRect {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(a.x - b.x) + WALK_WIDTH, d: Math.abs(a.z - b.z) + WALK_WIDTH };
}

/** Orthogonal visibility grid. Dijkstra chooses the shortest safe gate route;
 * every segment reserves its full width, not just a collision-free centerline. */
export function routeToStreet(p: Parcel, start: GroundPoint, obstacles: GroundRect[]): GroundPoint[] {
  const half = WALK_WIDTH / 2, pad = half + 0.04;
  const boundX = p.w / 2 - half, boundZ = p.d / 2 - half;
  const gates = [p.edges.n && { x: 0, z: -boundZ }, p.edges.s && { x: 0, z: boundZ },
    p.edges.e && { x: boundX, z: 0 }, p.edges.w && { x: -boundX, z: 0 }].filter(Boolean) as GroundPoint[];
  if (!gates.length || !insidePlot(pathRect(start, start), p)) return [];
  const unique = (values: number[], bound: number) => [...new Set(values.filter(v => Math.abs(v) <= bound + 0.00001))].sort((a, b) => a - b);
  const xs = unique([start.x, 0, -boundX, boundX, ...obstacles.flatMap(r => [r.x - r.w / 2 - pad, r.x + r.w / 2 + pad])], boundX);
  const zs = unique([start.z, 0, -boundZ, boundZ, ...obstacles.flatMap(r => [r.z - r.d / 2 - pad, r.z + r.d / 2 + pad])], boundZ);
  const nodes = xs.flatMap(x => zs.map(z => ({ x, z })));
  const safe = (a: GroundPoint, b: GroundPoint) => !obstacles.some(r => overlaps(pathRect(a, b), r));
  const source = nodes.findIndex(n => n.x === start.x && n.z === start.z);
  if (source < 0 || !safe(start, start)) return [];
  const goals = new Set(gates.map(g => nodes.findIndex(n => n.x === g.x && n.z === g.z)));
  const cost = nodes.map(() => Infinity), prev = nodes.map(() => -1), seen = new Set<number>();
  cost[source] = 0;
  // Grids are bounded by architectural obstacles (usually <400 nodes).
  for (let step = 0; step < nodes.length; step++) {
    let current = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!seen.has(i) && cost[i] < best) { best = cost[i]; current = i; }
    if (current < 0) return [];
    if (goals.has(current)) {
      const route: GroundPoint[] = [];
      for (let n = current; n >= 0; n = prev[n]) route.unshift(nodes[n]);
      return route.filter((point, i) => i === 0 || i === route.length - 1 ||
        !((route[i - 1].x === point.x && point.x === route[i + 1].x) || (route[i - 1].z === point.z && point.z === route[i + 1].z)));
    }
    seen.add(current);
    const xi = Math.floor(current / zs.length), zi = current % zs.length;
    for (const next of [xi > 0 ? current - zs.length : -1, xi + 1 < xs.length ? current + zs.length : -1,
      zi > 0 ? current - 1 : -1, zi + 1 < zs.length ? current + 1 : -1]) {
      if (next < 0 || seen.has(next) || !safe(nodes[current], nodes[next])) continue;
      const distance = best + Math.abs(nodes[current].x - nodes[next].x) + Math.abs(nodes[current].z - nodes[next].z);
      if (distance < cost[next]) { cost[next] = distance; prev[next] = current; }
    }
  }
  return [];
}

export function groundsPlan(p: Parcel) {
  const front = streetFront(p), obstacles = groundObstacles(p);
  if (!front) return { obstacles, route: [] as GroundPoint[], paving: [] as GroundRect[], beds: [] as GroundRect[] };
  const sin = Math.sin(front.rotation), cos = Math.cos(front.rotation);
  // Reserve existing entrance furniture, so paths and planting cannot cross it.
  const place = (x: number, z: number) => ({ x: front.x + x * cos + z * sin, z: front.z - x * sin + z * cos });
  for (const side of [-1, 1]) {
    const at = place(side * front.width * 0.36, front.depth / 2 + 0.7);
    obstacles.push({ ...at, w: 1.5 * Math.min(1, front.width / 10), d: 1.5 * Math.min(1, front.width / 10) });
  }
  if (front.width > 12) obstacles.push({ ...place(-front.width * 0.23, front.depth / 2 + 1), w: 1.9, d: 1.9 });
  const route = routeToStreet(p, place(0, front.depth / 2 + 0.85), obstacles);
  const paving = route.slice(1).map((point, i) => pathRect(route[i], point));
  const beds: GroundRect[] = [];
  // Deterministic candidates, accepted only when completely clear of the path
  // and the actual houses. No speculative gardens on occupied building volume.
  for (const x of [-p.w / 2 + 1, p.w / 2 - 1, -p.w * 0.24, p.w * 0.24]) {
    for (const z of [-p.d / 2 + 1.2, p.d / 2 - 1.2, 0]) {
      const bed = { x, z, w: 1.1, d: 1.5 };
      if (insidePlot(bed, p) && ![...obstacles, ...paving, ...beds].some(r => overlaps(bed, r, 0.25))) beds.push(bed);
      if (beds.length === 6) break;
    }
    if (beds.length === 6) break;
  }
  return { obstacles, route, paving, beds };
}
