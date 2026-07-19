/* ============================================================
   Huvudvägnätet – klassiska leder som data + generator för
   slumpade layouter.

   Klassiska ROADS är handlinjerade mot kvartersgatorna i den
   klassiska kartan och returneras oförändrade för CLASSIC_SEED.
   roadsForLayout() genererar motsvarande nät för en godtycklig
   layout: samma nio logiska kopplingar (Centrum↔Innerstaden,
   esplanaden till Hamnen, avenyn till Finans osv.), där varje led
   läggs I LINJE MED EN RIKTIG KVARTERSGATA i båda distrikten den
   binder ihop. Ligger distriktens gator inte mitt för varandra
   byggs leden som ett L: två stubbar längs var sin gata och en
   tvärgående länk i korridoren mellan distrikten.

   Vakterna (roads.test.ts-invarianterna, körda över många seeds i
   cityDecorGen.test.ts): inom kartan, inte i vattnet, fritt från
   HK, ingen led genom expansionsmark eller genom ett distrikt den
   inte ansluter till, och alla sju distrikt nåbara från Centrum.
   ============================================================ */

import { zoneStreets } from "./city";
import {
  CLASSIC_SEED,
  COAST_Z,
  HQ_RESERVE,
  MAP_BOUNDS,
  zoneFootprint,
  type CityLayout,
  type ZoneDef,
} from "./cityLayout";

/** En körbana som en axelriktad rektangel (centrum x/z, bredd/djup). */
export interface RoadSeg {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Klassiska kartans handlinjerade huvudleder (flyttade från three/roadNet). */
export const CLASSIC_ROADS: RoadSeg[] = [
  // Nord–sydliga stråken genom Centrum
  { x: 60, z: -88, w: 14, d: 44 },    // Centrum ↑ Innerstaden (gata x63/x58)
  { x: 2, z: 163, w: 16, d: 150 },    // Esplanaden: Centrum ↓ Hamnen (gata x0/x4)
  // Österut mot Finans och Industriområdet
  { x: 146, z: 60, w: 70, d: 12 },    // Avenyn: Centrum → Finans (gata z56/z64)
  { x: 195, z: -12, w: 14, d: 126 },  // Finans ↑ Industri (gata x196/x194, väster om kommunal mark)
  { x: 196, z: 215, w: 12, d: 44 },   // Finans ↓ Hamnen (delad gata x196)
  // Västerut mot Förorten och Villakullen
  { x: -141, z: 9, w: 56, d: 12 },    // Centrum ← Förorten (gata z10/z7)
  { x: -182, z: -229, w: 54, d: 12 }, // Innerstaden ← Villakullen (gata z-230/z-228)
  { x: -250, z: -81, w: 12, d: 62 },  // Villakullen ↓ Förorten (delad gata x-250)
  // Sydvästra kajstråket (förbi HK ned till kajen)
  { x: -280, z: 214, w: 12, d: 128 }, // Förorten ↓ kajen (gata x-280)
  { x: -233, z: 274, w: 126, d: 12 }, // Västra kajvägen → Hamnen (gata z274)
];

/** De nio logiska kopplingarna (samma topologi som klassiska nätet). */
const LINKS: Array<{ a: string; b: string; w: number }> = [
  { a: "innerstad", b: "centrum", w: 14 },
  { a: "centrum", b: "hamnen", w: 16 },
  { a: "centrum", b: "finans", w: 12 },
  { a: "industri", b: "finans", w: 14 },
  { a: "finans", b: "hamnen", w: 12 },
  { a: "förort", b: "centrum", w: 12 },
  { a: "kulle", b: "innerstad", w: 12 },
  { a: "kulle", b: "förort", w: 12 },
  { a: "förort", b: "hamnen", w: 12 },
];

interface Rect { x0: number; x1: number; z0: number; z1: number }

function zoneRectOf(z: ZoneDef): Rect {
  const s = zoneFootprint(z);
  return { x0: z.cx - s.w / 2, x1: z.cx + s.w / 2, z0: z.cz - s.d / 2, z1: z.cz + s.d / 2 };
}

/** Överlappar rektanglarna när båda krympts med `m` (roads.test-semantiken)? */
function intersects(a: Rect, b: Rect, m = 0): boolean {
  return a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
}

function rectPointDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/** Box → RoadSeg. */
function toSeg(r: Rect): RoadSeg {
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0 };
}

/**
 * Genererar huvudlederna för en layout. Klassisk seed → klassiska nätet.
 * Ren funktion av layouten (ingen slump): första giltiga gatuparet vinner,
 * så samma layout ger alltid samma vägnät.
 */
export function roadsForLayout(layout: CityLayout): RoadSeg[] {
  if (layout.seed === CLASSIC_SEED) return CLASSIC_ROADS.map((r) => ({ ...r }));

  const zoneByDistrict = new Map(layout.zones.map((z) => [z.district, z] as const));
  const rectByDistrict = new Map(layout.zones.map((z) => [z.district, zoneRectOf(z)] as const));
  const expRects: Rect[] = layout.expansions.map((e) => {
    const w = e.parcelCols * e.parcelW;
    const d = e.parcelRows * e.parcelD;
    return { x0: e.cx - w / 2, x1: e.cx + w / 2, z0: e.cz - d / 2, z1: e.cz + d / 2 };
  });
  const streets = zoneStreets(layout.zones);

  /** Giltig delsträcka? Får bara tränga in i sina måldistrikt, aldrig i
   *  expansionsmark, HK-cirkeln, vattnet eller utanför kartan. */
  const segOk = (r: Rect, targets: ReadonlySet<string>): boolean => {
    if (r.x0 < MAP_BOUNDS.x0 + 4 || r.x1 > MAP_BOUNDS.x1 - 4) return false;
    if (r.z0 < MAP_BOUNDS.z0 + 4 || r.z1 > COAST_Z - 3) return false;
    if (rectPointDist(r, HQ_RESERVE.x, HQ_RESERVE.z) <= HQ_RESERVE.r + 2) return false;
    for (const [district, zr] of rectByDistrict)
      if (!targets.has(district) && intersects(r, zr, 2)) return false;
    for (const er of expRects) if (intersects(r, er, -2)) return false;
    return true;
  };

  const out: RoadSeg[] = [];

  for (const link of LINKS) {
    const za = zoneByDistrict.get(link.a)!;
    const zb = zoneByDistrict.get(link.b)!;
    const ra = rectByDistrict.get(link.a)!;
    const rb = rectByDistrict.get(link.b)!;

    // Orientering: den axel där distrikten är åtskilda (störst lucka vinner
    // om båda är det). Zonplaceraren garanterar ≥12 lucka längs minst en axel.
    const zGap = Math.max(rb.z0 - ra.z1, ra.z0 - rb.z1);
    const xGap = Math.max(rb.x0 - ra.x1, ra.x0 - rb.x1);
    const vertical = zGap >= xGap;

    // N/S (eller V/Ö): led alltid från den "första" mot den "andra".
    const [first, second] = vertical
      ? ra.z1 < rb.z0
        ? [{ z: za, r: ra, d: link.a }, { z: zb, r: rb, d: link.b }]
        : [{ z: zb, r: rb, d: link.b }, { z: za, r: ra, d: link.a }]
      : ra.x1 < rb.x0
        ? [{ z: za, r: ra, d: link.a }, { z: zb, r: rb, d: link.b }]
        : [{ z: zb, r: rb, d: link.b }, { z: za, r: ra, d: link.a }];

    // Kvartersgator vinkelrätt mot luckan: deras mittlinjer är ledens
    // kandidatlägen. (Vertikala gator har d ≈ zonens djup, horisontella w ≈
    // zonens bredd – filtret på proportionen skiljer dem åt.)
    const lanesOf = (district: string, wantVertical: boolean) =>
      streets
        .filter((s) => s.district === district && (s.d > s.w) === wantVertical)
        .map((s) => (wantVertical ? s.x : s.z));
    const lanesA = lanesOf(first.d, vertical);
    const lanesB = lanesOf(second.d, vertical);

    const pairs: Array<{ la: number; lb: number; diff: number }> = [];
    for (const la of lanesA) for (const lb of lanesB) pairs.push({ la, lb, diff: Math.abs(la - lb) });
    pairs.sort((p, q) => p.diff - q.diff);

    const gapLo = vertical ? first.r.z1 : first.r.x1;
    const gapHi = vertical ? second.r.z0 : second.r.x0;
    const gapMid = (gapLo + gapHi) / 2;
    const pen = 20; // så långt in i distriktet leden går
    const targets = new Set([link.a, link.b]);
    const targetA = new Set([first.d]);
    const targetB = new Set([second.d]);

    // En rak led läggs mitt emellan gatuparen och naggar därmed kanttomterna
    // med (ledbredd − gatubredd)/2 + offset. Klassiska kartan tillåter ~6,5;
    // taket här håller intrånget under det även när gatorna är som smalast.
    const maxStraightDiff = Math.min(
      6,
      Math.max(0, 2 * (6.5 - link.w / 2) + Math.min(first.z.street, second.z.street)),
    );

    let placed: RoadSeg[] | null = null;
    for (const { la, lb, diff } of pairs) {
      if (diff <= maxStraightDiff) {
        // Rak led längs (nästan) samma gatulinje i båda distrikten.
        const c = (la + lb) / 2;
        const r: Rect = vertical
          ? { x0: c - link.w / 2, x1: c + link.w / 2, z0: gapLo - pen, z1: gapHi + pen }
          : { x0: gapLo - pen, x1: gapHi + pen, z0: c - link.w / 2, z1: c + link.w / 2 };
        if (segOk(r, targets)) placed = [toSeg(r)];
      } else {
        // L-led: stubbe längs vardera gatan + tvärlänk i korridoren. Tvär-
        // länkens läge provas på flera höjder – mitten kan vara blockerad av
        // ett expansionskvarter som förankrats i korridoren.
        const jogD = Math.min(10, gapHi - gapLo - 4);
        if (jogD < 6) continue;
        for (const jz of [gapMid, gapLo + 4 + jogD / 2, gapHi - 4 - jogD / 2]) {
          const s1: Rect = vertical
            ? { x0: la - link.w / 2, x1: la + link.w / 2, z0: gapLo - pen, z1: jz + jogD / 2 }
            : { x0: gapLo - pen, x1: jz + jogD / 2, z0: la - link.w / 2, z1: la + link.w / 2 };
          const s2: Rect = vertical
            ? { x0: lb - link.w / 2, x1: lb + link.w / 2, z0: jz - jogD / 2, z1: gapHi + pen }
            : { x0: jz - jogD / 2, x1: gapHi + pen, z0: lb - link.w / 2, z1: lb + link.w / 2 };
          const jog: Rect = vertical
            ? {
                x0: Math.min(la, lb) - link.w / 2, x1: Math.max(la, lb) + link.w / 2,
                z0: jz - jogD / 2, z1: jz + jogD / 2,
              }
            : {
                x0: jz - jogD / 2, x1: jz + jogD / 2,
                z0: Math.min(la, lb) - link.w / 2, z1: Math.max(la, lb) + link.w / 2,
              };
          if (segOk(s1, targetA) && segOk(s2, targetB) && segOk(jog, new Set<string>())) {
            placed = [toSeg(s1), toSeg(jog), toSeg(s2)];
            break;
          }
        }
      }
      if (placed) break;
    }
    if (placed) out.push(...placed);
    // Ingen kandidat: länken utelämnas – konnektivitetsvakten i testerna
    // avslöjar om det någonsin inträffar (och för vilken seed).
  }
  return out;
}
