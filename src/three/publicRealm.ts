import type { PropTypeKey } from "../engine/types";
import type { Parcel } from "../engine/city";
import {
  COAST_Z,
  HQ_RESERVE,
  MAP_BOUNDS,
  zoneFootprint,
  type CityLayout,
} from "../engine/cityLayout";
import type { RoadSeg } from "../engine/roadGen";
import type { LandmarkAnchor } from "../engine/landmarkGen";
import { groundsPlan, overlaps, type GroundRect } from "./groundsLayout";
export type RealmStyle = "urban" | "boulevard" | "park" | "nature" | "service" | "quay";
export interface RealmArea extends GroundRect {
  style: RealmStyle;
}
export interface RealmFeature extends RealmArea {
  kind: "tree" | "shrub" | "bench" | "lamp" | "play" | "utility";
}
const grow = (r: GroundRect, m: number): GroundRect => ({ ...r, w: r.w + m * 2, d: r.d + m * 2 });
const distance = (x: number, z: number, r: GroundRect) =>
  Math.hypot(Math.max(0, Math.abs(x - r.x) - r.w / 2), Math.max(0, Math.abs(z - r.z) - r.d / 2));
const land = (r: GroundRect) =>
  r.x - r.w / 2 >= MAP_BOUNDS.x0 &&
  r.x + r.w / 2 <= MAP_BOUNDS.x1 &&
  r.z - r.d / 2 >= MAP_BOUNDS.z0 &&
  r.z + r.d / 2 <= COAST_Z - 3;

/** Clip a straight strip along its long axis. Its full width is protected. */
export function clearStrip(r: GroundRect, obstacles: GroundRect[]): GroundRect[] {
  const horizontal = r.w >= r.d,
    half = (horizontal ? r.w : r.d) / 2,
    center = horizontal ? r.x : r.z;
  let spans = [[center - half, center + half]];
  for (const obstacle of obstacles) {
    if (!overlaps(r, obstacle)) continue;
    const a = (horizontal ? obstacle.x : obstacle.z) - (horizontal ? obstacle.w : obstacle.d) / 2;
    const b = (horizontal ? obstacle.x : obstacle.z) + (horizontal ? obstacle.w : obstacle.d) / 2;
    spans = spans.flatMap(([lo, hi]) =>
      b <= lo || a >= hi
        ? [[lo, hi]]
        : [
            [lo, Math.min(hi, a)],
            [Math.max(lo, b), hi],
          ].filter(([l, h]) => h - l > 0.15),
    );
  }
  return spans.map(([a, b]) =>
    horizontal ? { ...r, x: (a + b) / 2, w: b - a } : { ...r, z: (a + b) / 2, d: b - a },
  );
}
/** Plane union, avoids stacking coplanar surfaces at parcel corners. */
export function unionRects(rects: GroundRect[]): GroundRect[] {
  const xs = [...new Set(rects.flatMap((r) => [r.x - r.w / 2, r.x + r.w / 2]))].sort(
    (a, b) => a - b,
  );
  const result: GroundRect[] = [];
  let previous = new Map<string, GroundRect>();
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1],
      b = xs[i];
    if (b - a < 0.001) continue;
    const spans = rects
      .filter((r) => r.x - r.w / 2 < b - 0.0001 && r.x + r.w / 2 > a + 0.0001)
      .map((r) => [r.z - r.d / 2, r.z + r.d / 2])
      .sort((u, v) => u[0] - v[0]);
    const merged: number[][] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (last && span[0] <= last[1] + 0.0001) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    const next = new Map<string, GroundRect>();
    for (const [lo, hi] of merged) {
      const key = `${lo.toFixed(4)}:${hi.toFixed(4)}`,
        old = previous.get(key);
      if (old && Math.abs(old.x + old.w / 2 - a) < 0.001) {
        old.w += b - a;
        old.x += (b - a) / 2;
        next.set(key, old);
      } else {
        const r = { x: (a + b) / 2, z: (lo + hi) / 2, w: b - a, d: hi - lo };
        result.push(r);
        next.set(key, r);
      }
    }
    previous = next;
  }
  return result;
}
export function realmStyle(a: string, b: string): RealmStyle {
  if (a === "hamnen" || b === "hamnen") return "quay";
  if (a === "industri" || b === "industri") return "service";
  if ([a, b].includes("kulle")) return "nature";
  if ([a, b].includes("förort")) return "park";
  if ([a, b].includes("finans")) return "boulevard";
  return "urban";
}

export function publicRealmPlan(
  layout: CityLayout,
  parcels: Parcel[],
  roads: RoadSeg[],
  landmarks: LandmarkAnchor[],
  extraReserves: GroundRect[] = [],
  unlocked: Set<string> = new Set(),
  properties: Map<string, PropTypeKey> = new Map(),
) {
  const zones = layout.zones.map((z) => ({
    x: z.cx,
    z: z.cz,
    ...zoneFootprint(z),
    district: z.district,
  }));
  const expansions = layout.expansions.map((e) => ({
    x: e.cx,
    z: e.cz,
    w: e.parcelCols * e.parcelW,
    d: e.parcelRows * e.parcelD,
  }));
  const reserves: GroundRect[] = [
    ...expansions.map((r) => grow(r, 2)),
    ...landmarks.map((r) => grow(r, 3)),
    { x: HQ_RESERVE.x, z: HQ_RESERVE.z, w: HQ_RESERVE.r * 2 + 6, d: HQ_RESERVE.r * 2 + 6 },
    ...extraReserves,
  ];
  const solid = [...zones.map((r) => grow(r, 4)), ...reserves, ...roads.map((r) => grow(r, 0.5))];
  const protectedWalks = [...parcels, ...roads, ...reserves];
  const strips: GroundRect[] = [];
  const drives: GroundRect[] = [];
  for (const p of parcels) {
    if (p.expansion && !unlocked.has(p.blockId)) continue;
    const width = Math.min(
      3,
      Math.max(1, (layout.zones.find((z) => z.district === p.district)?.street ?? 10) * 0.19),
    );
    for (const edge of ["n", "s", "e", "w"] as const) {
      if (!p.edges[edge]) continue;
      const horizontal = edge === "s" || edge === "n",
        sign = edge === "s" || edge === "e" ? 1 : -1;
      strips.push(
        ...clearStrip(
          {
            x: p.x + (horizontal ? 0 : sign * (p.w / 2 + width / 2)),
            z: p.z + (horizontal ? sign * (p.d / 2 + width / 2) : 0),
            w: horizontal ? p.w + width : width,
            d: horizontal ? width : p.d + width,
          },
          protectedWalks,
        ),
      );
    }
    for (const a of (properties.has(p.id)
      ? groundsPlan(p, properties.get(p.id)).amenities
      : []
    ).filter((a) => a.kind === "parking" || a.kind === "loading")) {
      const horizontal = a.rotation === 0,
        sign = horizontal ? Math.sign(a.z) : Math.sign(a.x);
      const r = {
        x: p.x + (horizontal ? a.x : sign * (p.w / 2 + width / 2)),
        z: p.z + (horizontal ? sign * (p.d / 2 + width / 2) : a.z),
        w: horizontal ? a.w : width + 0.1,
        d: horizontal ? width + 0.1 : a.d,
      };
      if (land(r) && !roads.some((b) => overlaps(r, b))) drives.push(r);
    }
  }
  // Connect district sidewalks across the open corridors on both sides of roads.
  for (const road of roads) {
    const horizontal = road.w >= road.d;
    for (const side of [-1, 1])
      strips.push(
        ...clearStrip(
          {
            x: road.x + (horizontal ? 0 : side * (road.w / 2 + 0.85)),
            z: road.z + (horizontal ? side * (road.d / 2 + 0.85) : 0),
            w: horizontal ? road.w : 1.7,
            d: horizontal ? 1.7 : road.d,
          },
          protectedWalks,
        ),
      );
  }
  const harbor = zones.find((z) => z.district === "hamnen");
  if (harbor)
    strips.push(
      ...clearStrip({ x: harbor.x, z: COAST_Z - 5, w: harbor.w + 100, d: 3 }, protectedWalks),
    );
  const sidewalks = unionRects(strips.filter(land));
  const crossings: GroundRect[] = [];
  // Crossings belong at real intersecting roads, with pavement at both ends.
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i],
        b = roads[j],
        horizontal = a.w >= a.d;
      if (horizontal === b.w >= b.d || !overlaps(a, b)) continue;
      for (const side of [-1, 1]) {
        const r = horizontal
          ? { x: b.x + side * (b.w / 2 + 2), z: a.z, w: 1.8, d: a.d }
          : { x: a.x, z: b.z + side * (b.d / 2 + 2), w: a.w, d: 1.8 };
        const ends = horizontal
          ? [
              { x: r.x, z: r.z - r.d / 2 - 0.4, w: 1, d: 0.9 },
              { x: r.x, z: r.z + r.d / 2 + 0.4, w: 1, d: 0.9 },
            ]
          : [
              { x: r.x - r.w / 2 - 0.4, z: r.z, w: 0.9, d: 1 },
              { x: r.x + r.w / 2 + 0.4, z: r.z, w: 0.9, d: 1 },
            ];
        if (
          land(r) &&
          !parcels.some((p) => overlaps(r, p)) &&
          ends.every((e) => sidewalks.some((s) => overlaps(s, e))) &&
          !crossings.some((c) => overlaps(c, r, 1))
        )
          crossings.push(r);
      }
    }
  const plazas: RealmArea[] = [],
    paths: RealmArea[] = [],
    features: RealmFeature[] = [],
    meadows: RealmArea[] = [];
  const clear = (r: GroundRect, other: GroundRect[] = []) =>
    land(r) && ![...solid, ...sidewalks, ...other].some((b) => overlaps(r, b, 0.3));
  const nearest = (x: number, z: number) =>
    [...zones].sort((a, b) => distance(x, z, a) - distance(x, z, b)).slice(0, 2);
  // Public destinations branch off a real sidewalk through a collision-checked path.
  for (const s of sidewalks) {
    if (plazas.length >= 30 || Math.max(s.w, s.d) < 6) continue;
    const near = nearest(s.x, s.z),
      style = realmStyle(near[0].district, near[1].district);
    if (plazas.filter((p) => p.style === style).length >= 5) continue;
    for (const sign of [-1, 1]) {
      const horizontal = s.w >= s.d,
        r = {
          x: s.x + (horizontal ? 0 : sign * 9),
          z: s.z + (horizontal ? sign * 9 : 0),
          w: style === "nature" ? 8 : 10,
          d: style === "nature" ? 8 : 10,
          style,
        };
      const path = {
        x: (r.x + s.x) / 2,
        z: (r.z + s.z) / 2,
        w: horizontal ? 1.6 : Math.abs(r.x - s.x),
        d: horizontal ? Math.abs(r.z - s.z) : 1.6,
        style,
      };
      if (!clear(r, [...plazas, ...paths]) || !land(path) || solid.some((b) => overlaps(path, b)))
        continue;
      plazas.push(r);
      paths.push(path);
      features.push({
        ...r,
        x: r.x + r.w * 0.27,
        z: r.z + r.d * 0.25,
        w: 2.5,
        d: 1,
        kind: "bench",
      });
      features.push({
        ...r,
        x: r.x - r.w * 0.3,
        z: r.z + r.d * 0.25,
        w: 0.5,
        d: 0.5,
        kind: "lamp",
      });
      if (style === "nature" && !features.some((f) => f.kind === "play"))
        features.push({ ...r, x: r.x, z: r.z - 1, w: 3, d: 3, kind: "play" });
      if (style === "service")
        features.push({ ...r, x: r.x, z: r.z - 1, w: 2, d: 1.4, kind: "utility" });
      break;
    }
  }
  // Street trees make an actual avenue; reserve the complete crown and leave paths clear.
  for (const s of sidewalks) {
    const near = nearest(s.x, s.z),
      style = realmStyle(near[0].district, near[1].district);
    if (!["urban", "boulevard", "quay"].includes(style)) continue;
    const horizontal = s.w >= s.d,
      length = horizontal ? s.w : s.d;
    for (let t = -length / 2 + 6; t < length / 2 - 4; t += 12)
      for (const side of [-1, 1]) {
        if (features.filter((f) => f.kind === "tree").length >= 150) break;
        const r = {
          x: s.x + (horizontal ? t : side * (s.w / 2 + 2.5)),
          z: s.z + (horizontal ? side * (s.d / 2 + 2.5) : t),
          w: 4,
          d: 4,
          style,
        };
        if (clear(r, [...plazas, ...paths, ...features])) features.push({ ...r, kind: "tree" });
      }
  }
  // Sparse groves and open meadows soften the district boundary; every full canopy is reserved.
  for (let x = MAP_BOUNDS.x0 + 8; x < MAP_BOUNDS.x1 - 8; x += 12)
    for (let z = MAP_BOUNDS.z0 + 8; z < COAST_Z - 8; z += 12) {
      const near = nearest(x, z);
      if (distance(x, z, near[0]) > 80 || distance(x, z, near[1]) > 180) continue;
      const style = realmStyle(near[0].district, near[1].district),
        cell = { x, z, w: 12, d: 12, style };
      if (!clear(cell, [...plazas, ...paths])) continue;
      meadows.push(cell);
      const hash = Math.abs(Math.round(x * 31 + z * 17 + layout.seed * 13));
      if (hash % 5 < 2 && features.filter((f) => f.kind === "tree").length < 450)
        features.push({
          x: x + ((hash % 3) - 1) * 2,
          z: z + (((hash >> 2) % 3) - 1) * 2,
          w: 4,
          d: 4,
          style,
          kind: "tree",
        });
      else if (hash % 5 === 2) features.push({ x, z, w: 2.5, d: 2, style, kind: "shrub" });
    }
  return { sidewalks, drives, crossings, plazas, paths, features, meadows, reserves, solid };
}
