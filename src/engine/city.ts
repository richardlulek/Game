/* ============================================================
   Stadskarta – deterministisk spatial modell för 3D-vyn.
   Varje distrikt är en rektangulär zon med ett rutnät av
   tomtrutor (parcels). Fastigheter, marknadsobjekt och tomter
   refererar en parcel via parcelId; 3D-vyn ritar utifrån detta.
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
const PITCH = 34;
/** Byggbar yta per tomtruta. */
export const PARCEL_SIZE = 24;

interface ZoneSpec {
  district: string;
  cx: number;
  cz: number;
  cols: number;
  rows: number;
}

const ZONES: ZoneSpec[] = [
  { district: "centrum", cx: 0, cz: 0, cols: 5, rows: 5 },
  { district: "hamnen", cx: 10, cz: 198, cols: 6, rows: 3 },
  { district: "industri", cx: 236, cz: -30, cols: 5, rows: 4 },
  { district: "förort", cx: -236, cz: 44, cols: 5, rows: 5 },
  { district: "kulle", cx: -44, cz: -202, cols: 6, rows: 3 },
  { district: "storängen", cx: 240, cz: 190, cols: 5, rows: 4 },
];

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

/** Tomtrutor som upptas av speltillståndet (portfölj, marknad, tomter, konkurrenter). */
export function usedParcelIds(
  state: Pick<GameState, "portfolio" | "listings" | "lots"> &
    Partial<Pick<GameState, "competitors">>,
): Set<string> {
  const used = new Set<string>();
  for (const p of state.portfolio) if (p.parcelId) used.add(p.parcelId);
  for (const p of state.listings) if (p.parcelId) used.add(p.parcelId);
  for (const l of state.lots) if (l.parcelId) used.add(l.parcelId);
  // holdings saknas i sparfiler äldre än v4 – de migreras i persistence.ts.
  for (const c of state.competitors ?? [])
    for (const h of c.holdings ?? []) if (h.parcelId) used.add(h.parcelId);
  return used;
}

/** Distrikt som har minst en ledig tomtruta. */
export function districtsWithFreeParcels(occupied: Set<string>): string[] {
  return ZONES.map((z) => z.district).filter((d) => parcelsIn(d).some((p) => !occupied.has(p.id)));
}

/**
 * Slumpar en ledig tomtruta i distriktet och markerar den som upptagen
 * i det medskickade settet. Om allt är upptaget (bör inte hända – kartan
 * har fler rutor än spelet genererar objekt) återanvänds en slumpad ruta.
 */
export function claimRandomParcel(district: string, occupied: Set<string>): Parcel {
  const all = parcelsIn(district);
  const free = all.filter((p) => !occupied.has(p.id));
  const pool = free.length ? free : all;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  occupied.add(chosen.id);
  return chosen;
}

/** Första lediga rutan i distriktet – deterministisk, för sparfils-migrering. */
export function claimFirstFreeParcel(district: string, occupied: Set<string>): Parcel {
  const all = parcelsIn(district);
  const chosen = all.find((p) => !occupied.has(p.id)) ?? all[0];
  occupied.add(chosen.id);
  return chosen;
}

/**
 * Lägesfaktor: närmare stadskärnan (0,0) är mer attraktivt.
 * ~1,12 mitt i Centrum, ner mot ~0,94 i kartans utkanter.
 * Påverkar marknadsvärde och hyrespotential (se property.ts).
 */
export function locationFactor(parcelId: string): number {
  const p = parcelById(parcelId);
  if (!p) return 1;
  const dist = Math.hypot(p.x, p.z);
  const MAX_DIST = 340; // ungefärlig kartradie
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
