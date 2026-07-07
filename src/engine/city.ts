/* ============================================================
   Stadskarta – deterministisk spatial modell för 3D-vyn.
   Varje distrikt är en rektangulär zon med ett rutnät av
   tomtrutor (parcels). Synliga objekt (portfölj, marknad, tomter,
   konkurrentinnehav) placeras på rutor via placeCity(); världs-
   poolen är abstrakt och tar ingen plats förrän objekt avslöjas.
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
}

/** Ett distrikts zon på kartan (centrum i x/z, total bredd/djup). */
export interface DistrictZone {
  district: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Avstånd mellan tomtrutors centrum – mellanrummet blir gata. */
export const PITCH = 34;
/** Byggbar yta per tomtruta. */
export const PARCEL_SIZE = 24;

interface ZoneSpec {
  district: string;
  cx: number;
  cz: number;
  cols: number;
  rows: number;
}

// 162 rutor totalt – dimensionerat för spelarens portfölj, 12 listings,
// tomter och sju konkurrenter med växande innehav.
const ZONES: ZoneSpec[] = [
  { district: "centrum", cx: 0, cz: 0, cols: 6, rows: 6 },
  { district: "hamnen", cx: 10, cz: 205, cols: 8, rows: 4 },
  { district: "industri", cx: 252, cz: -20, cols: 6, rows: 5 },
  { district: "förort", cx: -252, cz: 30, cols: 6, rows: 6 },
  { district: "kulle", cx: -40, cz: -212, cols: 8, rows: 4 },
];

/** Rutnätsspecar per zon – används av 3D-vyn för kvartersgator. */
export const ZONE_GRIDS: readonly ZoneSpec[] = ZONES;
export type { ZoneSpec };

export const DISTRICT_ZONES: DistrictZone[] = ZONES.map((z) => ({
  district: z.district,
  x: z.cx,
  z: z.cz,
  w: z.cols * PITCH,
  d: z.rows * PITCH,
}));

function buildParcels(): Parcel[] {
  const out: Parcel[] = [];
  for (const zn of ZONES) {
    let i = 0;
    for (let r = 0; r < zn.rows; r++) {
      for (let c = 0; c < zn.cols; c++) {
        out.push({
          id: `${zn.district}-${i++}`,
          district: zn.district,
          x: zn.cx + (c - (zn.cols - 1) / 2) * PITCH,
          z: zn.cz + (r - (zn.rows - 1) / 2) * PITCH,
          w: PARCEL_SIZE,
          d: PARCEL_SIZE,
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

/**
 * Slumpar en ledig tomtruta i distriktet och markerar den som upptagen
 * i det medskickade settet. Om distriktet är fullt återanvänds en
 * slumpad ruta (två hus delar ruta visuellt – hellre det än krasch).
 */
export function claimRandomParcel(district: string, occupied: Set<string>): Parcel {
  const all = parcelsIn(district);
  const free = all.filter((p) => !occupied.has(p.id));
  const pool = free.length ? free : all;
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

  function claimFor<T extends { district: string; parcelId?: string }>(o: T): T {
    if (o.parcelId && BY_ID.has(o.parcelId) && !used.has(o.parcelId)) {
      used.add(o.parcelId);
      return o;
    }
    const parcel = claimRandomParcel(o.district, used);
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
 * Används av 3D-vyn; kan senare kopplas in i ekonomin.
 */
export function locationFactor(parcelId: string | undefined): number {
  const p = parcelId ? BY_ID.get(parcelId) : undefined;
  if (!p) return 1;
  const dist = Math.hypot(p.x, p.z);
  const MAX_DIST = 380; // ungefärlig kartradie
  const centrality = Math.max(0, 1 - dist / MAX_DIST);
  return +(0.94 + centrality * 0.18).toFixed(3);
}

/** Deterministisk hash (FNV-1a) – används för dekorativ stadsbebyggelse i 3D-vyn. */
export function parcelHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
