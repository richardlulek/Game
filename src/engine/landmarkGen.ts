/* ============================================================
   Landmärken – klassiska ankare som data + placerare för slumpade
   layouter.

   Varje landmärke behåller sin IDENTITET i förhållande till staden:
   stadshuset i avenyluckan Centrum–Finans, vattentornet i nordvästra
   utkanten ovanför Villakullen, skorstenarna norr om Industri,
   stadsparken och arenan i öppna ytan söder om Centrum, kyrkan i
   luckan Centrum–Förorten och pariserhjulet på västra kajen. Ankaret
   räknas ut ur layoutens zonrektanglar; därefter söker en
   deterministisk spiral närmsta fria läge (fritt från distrikt,
   expansionsmark, vägar, andra landmärken, HK och vattnet).

   CLASSIC_SEED returnerar exakt klassiska listan (kampanjens karta).
   ============================================================ */

import {
  CLASSIC_SEED,
  COAST_Z,
  HQ_RESERVE,
  MAP_BOUNDS,
  zoneFootprint,
  type CityLayout,
  type ZoneDef,
} from "./cityLayout";
import type { RoadSeg } from "./roadGen";

export type LandmarkType =
  | "stadshus"
  | "vattentorn"
  | "skorsten"
  | "stadspark"
  | "kyrka"
  | "arena"
  | "pariserhjul";

export interface LandmarkAnchor {
  id: string;
  type: LandmarkType;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Klassiska kartans landmärken (flyttade från three/landmarks). */
export const CLASSIC_LANDMARKS: LandmarkAnchor[] = [
  // w/d = fotavtryck INKL. omgivning (torg, gård, kompound), så vakten ser
  // till att inget växer in i ett distrikt. Anchorn (x,z) är renderingspunkten.
  { id: "stadshus",    type: "stadshus",    x: 146,  z: 18,   w: 36, d: 34 }, // stadshus m. klocktorn i avenylucka C–Finans
  { id: "vattentorn",  type: "vattentorn",  x: -390, z: -345, w: 44, d: 42 }, // inhägnad kompound i NV-utkanten
  { id: "skorsten-v",  type: "skorsten",    x: 300,  z: -262, w: 26, d: 26 }, // industriplan norr om Industriområdet
  { id: "skorsten-o",  type: "skorsten",    x: 350,  z: -262, w: 26, d: 26 },
  { id: "stadspark",   type: "stadspark",   x: -55,  z: 158,  w: 70, d: 60 }, // stora öppna ytan söder om Centrum
  { id: "kyrka",       type: "kyrka",       x: -140, z: 120,  w: 36, d: 40 }, // kyrka + kyrkogård i luckan C–Förort
  { id: "arena",       type: "arena",       x: 95,   z: 165,  w: 78, d: 70 }, // arena + entrétorg/parkering sydost om Centrum
  { id: "pariserhjul", type: "pariserhjul", x: -235, z: 285,  w: 36, d: 14 }, // västra kajen (pir/marina går ut i vattnet)
];

interface Rect { x0: number; x1: number; z0: number; z1: number }

function zoneRectOf(z: ZoneDef): Rect {
  const s = zoneFootprint(z);
  return { x0: z.cx - s.w / 2, x1: z.cx + s.w / 2, z0: z.cz - s.d / 2, z1: z.cz + s.d / 2 };
}

function boxAt(x: number, z: number, w: number, d: number): Rect {
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
}

function overlaps(a: Rect, b: Rect, buffer = 0): boolean {
  return a.x0 < b.x1 + buffer && a.x1 > b.x0 - buffer && a.z0 < b.z1 + buffer && a.z1 > b.z0 - buffer;
}

function rectPointDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/**
 * Placerar landmärkena för en layout. Klassisk seed → klassiska listan.
 * Ren funktion av layout + vägnät (ingen slump): ankare ur zonernas lägen,
 * sedan närmsta fria punkt i ett deterministiskt spiralrutnät.
 */
export function landmarksForLayout(layout: CityLayout, roads: RoadSeg[]): LandmarkAnchor[] {
  if (layout.seed === CLASSIC_SEED) return CLASSIC_LANDMARKS.map((l) => ({ ...l }));

  const rect = new Map(layout.zones.map((z) => [z.district, zoneRectOf(z)] as const));
  const zone = new Map(layout.zones.map((z) => [z.district, z] as const));
  const r = (d: string) => rect.get(d)!;
  const c = (d: string) => zone.get(d)!;

  const zoneRects = [...rect.values()];
  const expRects: Rect[] = layout.expansions.map((e) =>
    boxAt(e.cx, e.cz, e.parcelCols * e.parcelW, e.parcelRows * e.parcelD),
  );
  const roadRects: Rect[] = roads.map((s) => boxAt(s.x, s.z, s.w, s.d));
  const placed: Rect[] = [];

  const okAt = (b: Rect): boolean => {
    if (b.x0 < MAP_BOUNDS.x0 + 4 || b.x1 > MAP_BOUNDS.x1 - 4) return false;
    if (b.z0 < MAP_BOUNDS.z0 + 4 || b.z1 > COAST_Z - 3) return false;
    if (rectPointDist(b, HQ_RESERVE.x, HQ_RESERVE.z) <= HQ_RESERVE.r + 2) return false;
    for (const zr of zoneRects) if (overlaps(b, zr, 2)) return false;
    for (const er of expRects) if (overlaps(b, er, 2)) return false;
    for (const rr of roadRects) if (overlaps(b, rr, 2)) return false;
    for (const p of placed) if (overlaps(b, p, 4)) return false;
    return true;
  };

  // Ankare: samma relativa läge till "sina" distrikt som i klassiska kartan.
  const southGapZ = (r("centrum").z1 + r("hamnen").z0) / 2; // öppna ytan mot kajen
  const anchors: Record<string, { x: number; z: number }> = {
    stadshus:    { x: (r("centrum").x1 + r("finans").x0) / 2, z: c("centrum").cz + 8 },
    vattentorn:  { x: r("kulle").x0 + 65, z: r("kulle").z0 - 30 },
    "skorsten-v": { x: c("industri").cx - 20, z: r("industri").z0 - 27 },
    "skorsten-o": { x: c("industri").cx + 30, z: r("industri").z0 - 27 },
    stadspark:   { x: c("centrum").cx - 55, z: southGapZ },
    kyrka:       { x: (r("förort").x1 + r("centrum").x0) / 2, z: c("förort").cz + 65 },
    arena:       { x: c("centrum").cx + 95, z: southGapZ },
    pariserhjul: { x: r("hamnen").x0 - 50, z: 285 },
  };

  // Spiralrutnät: kandidatoffsets i växande avstånd från ankaret. Delas av
  // alla landmärken (deterministiskt och billigt att räkna fram en gång).
  const offsets: Array<{ ox: number; oz: number }> = [];
  // ±320 räcker även för trånga seeds där t.ex. arenan måste lämna en för
  // grund södra lucka och i stället ta ytan öster om Finans.
  for (let ox = -320; ox <= 320; ox += 8)
    for (let oz = -320; oz <= 320; oz += 8) offsets.push({ ox, oz });
  offsets.sort((a, b) => Math.hypot(a.ox, a.oz) - Math.hypot(b.ox, b.oz));

  // Störst fotavtryck placeras först: arenan behöver södra luckan mer än
  // stadsparken, som lättare hittar plats någon annanstans. Utdatat ordnas
  // sedan tillbaka till klassiska listordningen.
  const byArea = [...CLASSIC_LANDMARKS].sort((a, b) => b.w * b.d - a.w * a.d);
  const chosen = new Map<string, { x: number; z: number }>();
  for (const classic of byArea) {
    const anchor = anchors[classic.id];
    for (const { ox, oz } of offsets) {
      const b = boxAt(anchor.x + ox, anchor.z + oz, classic.w, classic.d);
      if (okAt(b)) {
        chosen.set(classic.id, { x: Math.round(anchor.x + ox), z: Math.round(anchor.z + oz) });
        placed.push(b);
        break;
      }
    }
    // Utan fritt läge inom sökradien utelämnas landmärket hellre än att det
    // ställs mitt i ett kvarter – invarianttesterna larmar om det inträffar.
  }
  const out: LandmarkAnchor[] = [];
  for (const classic of CLASSIC_LANDMARKS) {
    const spot = chosen.get(classic.id);
    if (spot) out.push({ ...classic, x: spot.x, z: spot.z });
  }
  return out;
}
