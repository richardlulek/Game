import type { RoadSeg } from "./roadNet";

export interface RoadPoint { x: number; z: number; }
interface Link { to: number; width: number; }
export interface RoadNode extends RoadPoint { links: Link[]; }
export interface TrafficRoute { points: RoadPoint[]; cumulative: number[]; length: number; }
const EPS = 0.0001;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Split actual road centerlines at crossings and overlapping endpoints.
 * No straight-line shortcuts across properties are ever introduced. */
export function buildRoadGraph(roads: readonly RoadSeg[]): RoadNode[] {
  const segments = roads.filter(r => r.w > 0 && r.d > 0).map(r => {
    const horizontal = r.w >= r.d;
    const center = horizontal ? r.x : r.z;
    const length = horizontal ? r.w : r.d;
    return { horizontal, fixed: horizontal ? r.z : r.x, from: center - length / 2,
      to: center + length / 2, width: Math.min(r.w, r.d), cuts: [center - length / 2, center + length / 2] };
  });
  const inside = (n: number, s: typeof segments[number]) => n >= s.from - EPS && n <= s.to + EPS;
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const a = segments[i], b = segments[j];
    if (a.horizontal !== b.horizontal) {
      if (inside(b.fixed, a) && inside(a.fixed, b)) { a.cuts.push(b.fixed); b.cuts.push(a.fixed); }
    } else if (near(a.fixed, b.fixed)) {
      for (const n of [a.from, a.to]) if (inside(n, b)) b.cuts.push(n);
      for (const n of [b.from, b.to]) if (inside(n, a)) a.cuts.push(n);
    }
  }
  const nodes: RoadNode[] = [], ids = new Map<string, number>();
  const node = (x: number, z: number) => {
    const key = `${Math.round(x / EPS)}:${Math.round(z / EPS)}`;
    const hit = ids.get(key);
    if (hit !== undefined) return hit;
    const index = nodes.length; nodes.push({ x, z, links: [] }); ids.set(key, index); return index;
  };
  const connect = (a: number, b: number, width: number) => {
    const existing = nodes[a].links.find(l => l.to === b);
    if (existing) existing.width = Math.max(existing.width, width);
    else nodes[a].links.push({ to: b, width });
  };
  for (const s of segments) {
    const cuts = [...new Set(s.cuts.map(c => Math.round(c / EPS) * EPS))].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const a = s.horizontal ? node(cuts[i - 1], s.fixed) : node(s.fixed, cuts[i - 1]);
      const b = s.horizontal ? node(cuts[i], s.fixed) : node(s.fixed, cuts[i]);
      if (a !== b) { connect(a, b, s.width); connect(b, a, s.width); }
    }
  }
  return nodes;
}

function random(seed: number) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

/** A closed, non-backtracking circuit: the car never teleports at a road end. */
export function findRoadCircuit(nodes: readonly RoadNode[], seed: number): number[] | null {
  if (!nodes.length) return null;
  const rand = random(seed);
  let current = Math.floor(rand() * nodes.length), previous = -1;
  const path: number[] = [], visited = new Map<number, number>();
  for (let step = 0; step < 160; step++) {
    const repeated = visited.get(current);
    if (repeated !== undefined) return path.length - repeated >= 3 ? path.slice(repeated) : null;
    visited.set(current, path.length); path.push(current);
    const options = nodes[current].links.filter(l => l.to !== previous);
    if (!options.length) return null;
    const next = options[Math.floor(rand() * options.length)].to;
    previous = current; current = next;
  }
  return null;
}

export function circuitToRoute(nodes: readonly RoadNode[], circuit: readonly number[]): TrafficRoute {
  const points: RoadPoint[] = [];
  for (let i = 0; i < circuit.length; i++) {
    const prev = nodes[circuit[(i + circuit.length - 1) % circuit.length]], p = nodes[circuit[i]], next = nodes[circuit[(i + 1) % circuit.length]];
    const inLength = Math.hypot(p.x - prev.x, p.z - prev.z), outLength = Math.hypot(next.x - p.x, next.z - p.z);
    const ix = (p.x - prev.x) / inLength, iz = (p.z - prev.z) / inLength;
    const ox = (next.x - p.x) / outLength, oz = (next.z - p.z) / outLength;
    const iw = p.links.find(l => l.to === circuit[(i + circuit.length - 1) % circuit.length])!.width;
    const ow = p.links.find(l => l.to === circuit[(i + 1) % circuit.length])!.width;
    // The narrowest streets need smaller cars and offsets than the old fixed 2.6.
    const il = Math.min(1.7, iw * 0.23), ol = Math.min(1.7, ow * 0.23);
    const trim = Math.min(Math.max(iw, ow) * 0.6, inLength * 0.25, outLength * 0.25);
    const a = { x: p.x - ix * trim - iz * il, z: p.z - iz * trim + ix * il };
    const b = { x: p.x + ox * trim - oz * ol, z: p.z + oz * trim + ox * ol };
    points.push(a);
    if (Math.abs(ix * ox + iz * oz) < 0.5) {
      const control = { x: p.x - iz * il - oz * ol, z: p.z + ix * il + ox * ol };
      for (let j = 1; j < 8; j++) {
        const t = j / 8, u = 1 - t;
        points.push({ x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, z: u * u * a.z + 2 * u * t * control.z + t * t * b.z });
      }
    }
    points.push(b);
  }
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
}

/** Writes into a reused object; no allocations in the animation loop. */
export function sampleRoute(route: TrafficRoute, distance: number, out: RoadPoint): void {
  if (!route.points.length || route.length <= 0) { out.x = 0; out.z = 0; return; }
  const d = ((distance % route.length) + route.length) % route.length;
  let lo = 0, hi = route.points.length;
  while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (route.cumulative[mid] <= d) lo = mid; else hi = mid; }
  const a = route.points[lo], b = route.points[(lo + 1) % route.points.length];
  const span = route.cumulative[lo + 1] - route.cumulative[lo];
  const t = span > 0 ? (d - route.cumulative[lo]) / span : 0;
  out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
}

export function makeTrafficRoutes(roads: readonly RoadSeg[], count: number): TrafficRoute[] {
  const nodes = buildRoadGraph(roads), routes: TrafficRoute[] = [];
  for (let attempt = 0; attempt < count * 8 && routes.length < count; attempt++) {
    const circuit = findRoadCircuit(nodes, attempt * 7919 + 104729);
    if (!circuit) continue;
    const route = circuitToRoute(nodes, circuit);
    if (route.length > 40) routes.push(route);
  }
  return routes;
}
