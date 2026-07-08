/* ============================================================
   Stadskarta 3.0 – deterministisk spatial modell i tre nivåer:
   distrikt (zon) → kvarter (block) → tomtrutor (parcels).

   Sju distrikt med egen kvartersstruktur:
   Centrum      slutna kvarter 3×2 tomter som delar väggar
   Finans       fristående skyskrapetomter i tätt rutnät
   Innerstad    kvarter 2×2 tomter, blandstad
   Hamnen       kajnära rad längs vattnet
   Industri     stora fristående industritomter
   Förorten     hela kvarter = EN fastighet (kvartersköp)
   Villakullen  små villatomter

   Synliga objekt (portfölj, marknad, tomter, konkurrentinnehav)
   placeras på tomtrutor via placeCity(); världspoolen är abstrakt
   och tar ingen plats förrän objekt avslöjas.
   Ren TypeScript utan React- eller Three-beroenden.
   ============================================================ */

import type { GameState } from "./types";

/** En tomtruta på kartan (världskoordinater, centrum i x/z). */
export interface Parcel {
  id: string;
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Kvarteret tomten ingår i. */
  blockId: string;
  /** Vilka sidor som vetter mot gata (kvarterets ytterkant). */
  edges: { n: boolean; e: boolean; s: boolean; w: boolean };
  /** Expansionskvarter: låst tills detaljplanen auktionerats ut. */
  expansion?: boolean;
}

/** Ett distrikts zon på kartan (centrum i x/z, total bredd/djup). */
export interface DistrictZone {
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Gatusegment (används av 3D-vyn för kvartersgator). */
export interface StreetSeg {
  x: number;
  z: number;
  w: number;
  d: number;
  district: string;
}

interface ZoneDef {
  district: string;
  cx: number;
  cz: number;
  /** Kvartersrutnät. */
  blockCols: number;
  blockRows: number;
  /** Tomter per kvarter. */
  parcelCols: number;
  parcelRows: number;
  /** Tomtstorlek. */
  parcelW: number;
  parcelD: number;
  /** Mellanrum mellan tomter i samma kvarter (0 = delar vägg). */
  innerGap: number;
  /** Gatubredd mellan kvarteren. */
  street: number;
}

const ZONES: ZoneDef[] = [
  // Centrum: 9 slutna kvarter à 3×2 tomter som delar väggar = 54 fastigheter
  { district: "centrum", cx: 0, cz: 10, blockCols: 3, blockRows: 3, parcelCols: 3, parcelRows: 2, parcelW: 24, parcelD: 24, innerGap: 0, street: 16 },
  // Finansdistriktet: 20 skyskrapetomter i tätt rutnät, sydost mot vattnet
  { district: "finans", cx: 214, cz: 120, blockCols: 5, blockRows: 4, parcelCols: 1, parcelRows: 1, parcelW: 26, parcelD: 26, innerGap: 0, street: 12 },
  // Innerstaden: 15 kvarter à 2×2 tomter norr om centrum = 60 fastigheter
  { district: "innerstad", cx: -10, cz: -185, blockCols: 5, blockRows: 3, parcelCols: 2, parcelRows: 2, parcelW: 24, parcelD: 24, innerGap: 0, street: 15 },
  // Hamnen: kajnära dubbelrad längs vattnet
  { district: "hamnen", cx: 0, cz: 262, blockCols: 10, blockRows: 2, parcelCols: 1, parcelRows: 1, parcelW: 24, parcelD: 24, innerGap: 0, street: 10 },
  // Industriområdet: stora fristående tomter i nordost
  { district: "industri", cx: 320, cz: -125, blockCols: 5, blockRows: 4, parcelCols: 1, parcelRows: 1, parcelW: 38, parcelD: 38, innerGap: 0, street: 12 },
  // Förorten: 16 storkvarter i väst – varje tomt är ETT helt kvarter
  { district: "förort", cx: -295, cz: 55, blockCols: 4, blockRows: 4, parcelCols: 1, parcelRows: 1, parcelW: 52, parcelD: 52, innerGap: 0, street: 13 },
  // Villakullen: små villatomter i nordväst
  { district: "kulle", cx: -305, cz: -195, blockCols: 6, blockRows: 4, parcelCols: 1, parcelRows: 1, parcelW: 22, parcelD: 22, innerGap: 0, street: 11 },
];

export const ZONE_DEFS: readonly ZoneDef[] = ZONES;
export type { ZoneDef };

/**
 * Expansionskvarter – mark utanför de färdiga kvarteren. Två slag:
 *  · "kommunal": kommunen planlägger och släpper via detaljplaneauktion
 *  · "plan": privat råmark (åker/äng) – spelaren kan köpa marken och
 *    driva EGEN detaljplan genom planprocessen (cityPlan.ts)
 * Låsta (obyggbara) tills de vunnits i auktion respektive vunnit laga kraft.
 */
export interface ExpansionDef {
  blockId: string;
  district: string;
  cx: number;
  cz: number;
  parcelCols: number;
  parcelRows: number;
  parcelW: number;
  parcelD: number;
  kind: "kommunal" | "plan";
  /** Nära vattnet → strandskydd kan bli en utmaning i planprocessen. */
  waterfront?: boolean;
}

const EXPANSIONS: ExpansionDef[] = [
  { blockId: "innerstad-exp0", district: "innerstad", cx: -73, cz: -311, parcelCols: 2, parcelRows: 2, parcelW: 24, parcelD: 24, kind: "kommunal" },
  { blockId: "industri-exp0", district: "industri", cx: 270, cz: 0, parcelCols: 1, parcelRows: 1, parcelW: 38, parcelD: 38, kind: "kommunal" },
  { blockId: "innerstad-exp1", district: "innerstad", cx: 53, cz: -311, parcelCols: 2, parcelRows: 2, parcelW: 24, parcelD: 24, kind: "kommunal" },
  { blockId: "förort-exp0", district: "förort", cx: -357.5, cz: 217.5, parcelCols: 1, parcelRows: 1, parcelW: 52, parcelD: 52, kind: "kommunal" },
  { blockId: "industri-exp1", district: "industri", cx: 370, cz: 0, parcelCols: 1, parcelRows: 1, parcelW: 38, parcelD: 38, kind: "kommunal" },
  // Planområden: privat råmark i stadens utkanter.
  { blockId: "kulle-plan0", district: "kulle", cx: -440, cz: -195, parcelCols: 2, parcelRows: 2, parcelW: 22, parcelD: 22, kind: "plan" },
  { blockId: "förort-plan0", district: "förort", cx: -447, cz: 90, parcelCols: 1, parcelRows: 1, parcelW: 52, parcelD: 52, kind: "plan" },
  { blockId: "innerstad-plan0", district: "innerstad", cx: -10, cz: -365, parcelCols: 2, parcelRows: 2, parcelW: 24, parcelD: 24, kind: "plan" },
  { blockId: "finans-plan0", district: "finans", cx: 335, cz: 120, parcelCols: 2, parcelRows: 2, parcelW: 26, parcelD: 26, kind: "plan" },
  { blockId: "industri-plan0", district: "industri", cx: 480, cz: -40, parcelCols: 1, parcelRows: 1, parcelW: 38, parcelD: 38, kind: "plan" },
  { blockId: "industri-plan1", district: "industri", cx: 480, cz: -220, parcelCols: 1, parcelRows: 1, parcelW: 38, parcelD: 38, kind: "plan" },
  { blockId: "hamnen-plan0", district: "hamnen", cx: 260, cz: 265, parcelCols: 2, parcelRows: 1, parcelW: 24, parcelD: 24, kind: "plan", waterfront: true },
];

/** Auktionsordningen för de KOMMUNALA expansionskvarteren. */
export const EXPANSION_BLOCKS = EXPANSIONS.filter((e) => e.kind === "kommunal").map((e) => ({
  blockId: e.blockId,
  district: e.district,
  parcels: e.parcelCols * e.parcelRows,
}));

/** Planområdena – råmark för spelarens egen detaljplansprocess. */
export const PLAN_AREAS: ExpansionDef[] = EXPANSIONS.filter((e) => e.kind === "plan");

/** Slår upp expansionskvarterets definition (kommunal eller plan). */
export const expansionByBlock = (blockId: string): ExpansionDef | undefined =>
  EXPANSIONS.find((e) => e.blockId === blockId);

function blockSize(z: ZoneDef): { w: number; d: number } {
  return {
    w: z.parcelCols * z.parcelW + (z.parcelCols - 1) * z.innerGap,
    d: z.parcelRows * z.parcelD + (z.parcelRows - 1) * z.innerGap,
  };
}

function zoneSize(z: ZoneDef): { w: number; d: number } {
  const b = blockSize(z);
  return {
    w: z.blockCols * b.w + (z.blockCols - 1) * z.street,
    d: z.blockRows * b.d + (z.blockRows - 1) * z.street,
  };
}

export const DISTRICT_ZONES: DistrictZone[] = ZONES.map((z) => {
  const s = zoneSize(z);
  return { district: z.district, x: z.cx, z: z.cz, w: s.w, d: s.d };
});

function buildParcels(): Parcel[] {
  const out: Parcel[] = [];
  for (const zn of ZONES) {
    const b = blockSize(zn);
    const s = zoneSize(zn);
    let i = 0;
    for (let br = 0; br < zn.blockRows; br++) {
      for (let bc = 0; bc < zn.blockCols; bc++) {
        const blockX = zn.cx - s.w / 2 + bc * (b.w + zn.street) + b.w / 2;
        const blockZ = zn.cz - s.d / 2 + br * (b.d + zn.street) + b.d / 2;
        const blockId = `${zn.district}-kv${br * zn.blockCols + bc}`;
        for (let pr = 0; pr < zn.parcelRows; pr++) {
          for (let pc = 0; pc < zn.parcelCols; pc++) {
            out.push({
              id: `${zn.district}-${i++}`,
              district: zn.district,
              x: blockX - b.w / 2 + pc * (zn.parcelW + zn.innerGap) + zn.parcelW / 2,
              z: blockZ - b.d / 2 + pr * (zn.parcelD + zn.innerGap) + zn.parcelD / 2,
              w: zn.parcelW,
              d: zn.parcelD,
              blockId,
              edges: {
                n: pr === 0,
                s: pr === zn.parcelRows - 1,
                w: pc === 0,
                e: pc === zn.parcelCols - 1,
              },
            });
          }
        }
      }
    }
  }
  // Expansionskvarteren – låsta tomter som öppnas via auktion.
  for (const ex of EXPANSIONS) {
    let i = 0;
    const bw = ex.parcelCols * ex.parcelW;
    const bd = ex.parcelRows * ex.parcelD;
    for (let pr = 0; pr < ex.parcelRows; pr++) {
      for (let pc = 0; pc < ex.parcelCols; pc++) {
        out.push({
          id: `${ex.blockId}-${i++}`,
          district: ex.district,
          x: ex.cx - bw / 2 + pc * ex.parcelW + ex.parcelW / 2,
          z: ex.cz - bd / 2 + pr * ex.parcelD + ex.parcelD / 2,
          w: ex.parcelW,
          d: ex.parcelD,
          blockId: ex.blockId,
          edges: {
            n: pr === 0,
            s: pr === ex.parcelRows - 1,
            w: pc === 0,
            e: pc === ex.parcelCols - 1,
          },
          expansion: true,
        });
      }
    }
  }
  return out;
}

/** Alla tomtrutor i staden. Deterministiskt – samma karta varje session. */
export const PARCELS: Parcel[] = buildParcels();

const BY_ID = new Map(PARCELS.map((p) => [p.id, p]));

/** Slår upp en tomtruta via id, eller undefined om id:t är okänt. */
export const parcelById = (id: string): Parcel | undefined => BY_ID.get(id);

/** Alla tomtrutor i ett distrikt. */
export const parcelsIn = (district: string): Parcel[] =>
  PARCELS.filter((p) => p.district === district);

/** Kvartersgator inne i zonerna – gatorna MELLAN kvarteren. */
export function zoneStreets(): StreetSeg[] {
  const out: StreetSeg[] = [];
  for (const zn of ZONES) {
    const b = blockSize(zn);
    const s = zoneSize(zn);
    const margin = 6; // gatorna sticker ut lite förbi kvarteren
    // Vertikala gator mellan kvarterskolumner
    for (let bc = 0; bc < zn.blockCols - 1; bc++) {
      const x = zn.cx - s.w / 2 + (bc + 1) * b.w + bc * zn.street + zn.street / 2;
      out.push({ x, z: zn.cz, w: zn.street * 0.62, d: s.d + margin, district: zn.district });
    }
    // Horisontella gator mellan kvartersrader
    for (let br = 0; br < zn.blockRows - 1; br++) {
      const z = zn.cz - s.d / 2 + (br + 1) * b.d + br * zn.street + zn.street / 2;
      out.push({ x: zn.cx, z, w: s.w + margin, d: zn.street * 0.62, district: zn.district });
    }
  }
  return out;
}

/** Beräknas en gång – gatunätet är statiskt. */
export const ZONE_STREETS: StreetSeg[] = zoneStreets();

/**
 * Sannolikhet (i %) att en ledig tomtruta bär dekorativ bebyggelse.
 * Delas av 3D-vyn (StaticCity) och tillväxtlogiken nedan så att kartan
 * och motorn alltid är överens om vad som är bebyggt.
 */
export function ambientChanceFor(district: string): number {
  if (district === "centrum" || district === "innerstad") return 80;
  if (district === "finans" || district === "hamnen") return 70;
  return 58;
}

/** Bär tomten ett dekorhus? Deterministiskt ur tomt-hashen, plus de
 *  hus som vuxit fram organiskt under spelets gång (ambientGrown). */
export function hasAmbientBuilding(p: Parcel, grown?: ReadonlySet<string>): boolean {
  if (p.expansion) return false;
  return parcelHash(p.id) % 100 < ambientChanceFor(p.district) || (grown?.has(p.id) ?? false);
}

/** Tomt-id:n som upptas av spelobjekt (ägda/annonser/tomter/rivaler). */
export function occupiedParcelIds(state: GameState): Set<string> {
  const used = new Set<string>();
  for (const p of state.portfolio) if (p.parcelId) used.add(p.parcelId);
  for (const p of state.listings) if (p.parcelId) used.add(p.parcelId);
  for (const l of state.lots) if (l.parcelId) used.add(l.parcelId);
  for (const c of state.competitors)
    for (const p of c.portfolio ?? []) if (p.parcelId) used.add(p.parcelId);
  return used;
}

/** Helt obebyggda, upplåsta tomtrutor (varken spelobjekt eller dekorhus).
 *  Parktomter (avstådda i planprocesser) räknas aldrig som byggbara. */
export function emptyParcels(state: GameState): Parcel[] {
  const used = occupiedParcelIds(state);
  const unlocked = new Set(state.unlockedBlocks ?? []);
  const grown = new Set(state.ambientGrown ?? []);
  const park = new Set(state.parkParcels ?? []);
  return PARCELS.filter(
    (p) =>
      (!p.expansion || unlocked.has(p.blockId)) &&
      !used.has(p.id) &&
      !park.has(p.id) &&
      !hasAmbientBuilding(p, grown),
  );
}

/** Distrikt som fortfarande har obebyggd mark – nyproduktion och nya
 *  tomter styrs hit så att bebyggda tomter aldrig behöver återanvändas. */
export function districtsWithSpace(state: GameState): Set<string> {
  return new Set(emptyParcels(state).map((p) => p.district));
}

/**
 * Slumpar en ledig tomtruta i distriktet och markerar den som upptagen
 * i det medskickade settet. Staden växer naturligt: obebyggd mark
 * (parker och lediga fält) bebyggs FÖRST. Dekorhus (privatägda) tas
 * bara i anspråk om distriktet är helt fullt, och en redan upptagen
 * ruta återanvänds enbart som krasch-skydd – nygenereringen styrs
 * numera till distrikt med ledig mark (districtsWithSpace).
 */
export function claimRandomParcel(
  district: string,
  occupied: Set<string>,
  allowed?: (p: Parcel) => boolean,
  grown?: ReadonlySet<string>,
): Parcel {
  const all = parcelsIn(district).filter((p) => (allowed ? allowed(p) : !p.expansion));
  const free = all.filter((p) => !occupied.has(p.id));
  const empty = free.filter((p) => !hasAmbientBuilding(p, grown));
  const pool = empty.length ? empty : free.length ? free : all;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  occupied.add(chosen.id);
  return chosen;
}

/**
 * Placerar alla synliga objekt på tomtrutor. Idempotent: objekt med
 * giltig, ledig ruta behåller den; övriga får en ledig ruta i sitt
 * distrikt. Returnerar samma referens om inget behövde ändras, så
 * funktionen kan köras efter varje reducer-action utan React-brus.
 * Världspoolen rörs aldrig – den är abstrakt tills objekt avslöjas.
 */
export function placeCity(state: GameState): GameState {
  const used = new Set<string>();
  let anyChanged = false;
  const unlocked = new Set(state.unlockedBlocks ?? []);
  const grown = new Set(state.ambientGrown ?? []);
  const park = new Set(state.parkParcels ?? []);
  const allowed = (p: Parcel) =>
    !park.has(p.id) && (!p.expansion || unlocked.has(p.blockId));

  function claimFor<T extends { district: string; parcelId?: string }>(o: T): T {
    if (o.parcelId && BY_ID.has(o.parcelId) && !used.has(o.parcelId)) {
      used.add(o.parcelId);
      return o;
    }
    const parcel = claimRandomParcel(o.district, used, allowed, grown);
    anyChanged = true;
    return { ...o, parcelId: parcel.id };
  }
  function placeArr<T extends { district: string; parcelId?: string }>(arr: T[]): T[] {
    let changed = false;
    const out = arr.map((o) => {
      const n = claimFor(o);
      if (n !== o) changed = true;
      return n;
    });
    return changed ? out : arr;
  }

  // Ordningen ger stabilitet: spelarens objekt behåller sina rutor först.
  const portfolio = placeArr(state.portfolio);
  const lots = placeArr(state.lots);
  const listings = placeArr(state.listings);
  let competitorsChanged = false;
  const competitors = state.competitors.map((c) => {
    const np = placeArr(c.portfolio);
    if (np === c.portfolio) return c;
    competitorsChanged = true;
    return { ...c, portfolio: np };
  });

  if (!anyChanged) return state;
  return {
    ...state,
    portfolio,
    lots,
    listings,
    competitors: competitorsChanged ? competitors : state.competitors,
  };
}

/**
 * Lägesfaktor: närmare stadskärnan (0,0) är mer attraktivt.
 * ~1,12 mitt i Centrum, ner mot ~0,94 i kartans utkanter.
 */
export function locationFactor(parcelId: string | undefined): number {
  const p = parcelId ? BY_ID.get(parcelId) : undefined;
  if (!p) return 1;
  const dist = Math.hypot(p.x, p.z);
  const MAX_DIST = 470; // ungefärlig kartradie
  const centrality = Math.max(0, 1 - dist / MAX_DIST);
  return +(0.94 + centrality * 0.18).toFixed(3);
}

/** Tomtruta under en världspunkt (x,z) – för klick på sammanslagen dekor. */
export function parcelAt(x: number, z: number): Parcel | undefined {
  return PARCELS.find(
    (p) => Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2,
  );
}

/** Deterministisk hash (FNV-1a) – används för variation i 3D-vyn. */
export function parcelHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
