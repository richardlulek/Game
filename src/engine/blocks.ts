/* ============================================================
   Helkvartersbonus – äg ALLA fastigheter i ett slutet kvarter
   (Centrum 3×2, Innerstaden 2×2) och kvarteret blir bolagets:
   samordnad drift ger högre hyra och lägre driftkostnad.
   Ren logik, inga React-beroenden.
   ============================================================ */

import { PARCELS, parcelById } from "./city";
import type { GameState, Property } from "./types";

export const BLOCK_RENT_BONUS = 1.10; // +10 % hyra i helägda kvarter
export const BLOCK_OPEX_CUT = 0.85; // −15 % driftkostnad

/** Kvarter → tomt-id:n, enbart kvarter med flera tomter (slutna kvarter). */
const BLOCK_PARCELS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const p of PARCELS) {
    if (!m.has(p.blockId)) m.set(p.blockId, []);
    m.get(p.blockId)!.push(p.id);
  }
  for (const [id, arr] of m) if (arr.length < 2) m.delete(id);
  return m;
})();

/** Alla kvarter som spelaren äger i sin helhet. Ägd, obebyggd tomtmark
 *  (köpta lots) räknas också – marken är din även utan hus på den. */
export function fullyOwnedBlocks(state: GameState): string[] {
  const ownedParcels = new Set(
    state.portfolio.filter((p) => p.parcelId).map((p) => p.parcelId!),
  );
  for (const l of state.lots) if (l.owned && l.parcelId) ownedParcels.add(l.parcelId);
  const out: string[] = [];
  for (const [blockId, parcelIds] of BLOCK_PARCELS) {
    if (parcelIds.every((id) => ownedParcels.has(id))) out.push(blockId);
  }
  return out;
}

/** Ingår fastigheten i ett kvarter som spelaren äger helt? */
export function hasBlockBonus(p: Property, state: GameState): boolean {
  if (!p.parcelId || !p.owned) return false;
  const parcel = parcelById(p.parcelId);
  if (!parcel) return false;
  const parcelIds = BLOCK_PARCELS.get(parcel.blockId);
  if (!parcelIds) return false;
  const ownedParcels = new Set(
    state.portfolio.filter((x) => x.parcelId).map((x) => x.parcelId!),
  );
  return parcelIds.every((id) => ownedParcels.has(id));
}

/** Antal tomter som saknas för att kvarteret ska bli helägt (0 = klart). */
export function blockGap(p: Property, state: GameState): number | null {
  if (!p.parcelId || p.signature) return null; // signaturkvarter ÄR kvarteret
  const parcel = parcelById(p.parcelId);
  if (!parcel) return null;
  const parcelIds = BLOCK_PARCELS.get(parcel.blockId);
  if (!parcelIds) return null;
  const ownedParcels = new Set(
    state.portfolio.filter((x) => x.parcelId).map((x) => x.parcelId!),
  );
  return parcelIds.filter((id) => !ownedParcels.has(id)).length;
}

/* ── Grannskapseffekt ───────────────────────────────────────────────
   Kvarterets skick smittar: välskötta grannar lyfter värde och hyra,
   förfallna drar ner. Cachen byggs en gång per tillstånd (WeakMap)
   eftersom värderingen anropas ofta under rendering och simulering. */

const HOOD_CACHE = new WeakMap<GameState, Map<string, { sum: number; n: number }>>();

function hoodMap(state: GameState): Map<string, { sum: number; n: number }> {
  let m = HOOD_CACHE.get(state);
  if (m) return m;
  m = new Map();
  const add = (p: Property) => {
    if (p.status !== "klar" || !p.parcelId) return;
    const parcel = parcelById(p.parcelId);
    if (!parcel) return;
    const e = m!.get(parcel.blockId) ?? { sum: 0, n: 0 };
    e.sum += p.condition;
    e.n += 1;
    m!.set(parcel.blockId, e);
  };
  for (const p of state.portfolio) add(p);
  for (const p of state.listings) add(p);
  for (const c of state.competitors) for (const p of c.portfolio ?? []) add(p);
  HOOD_CACHE.set(state, m);
  return m;
}

/** Grannarnas snittskick → värdefaktor: ≥75 upp till +4 %, <45 ned till −6 %. */
export function blockConditionMult(p: Property, state: GameState): number {
  if (!p.parcelId) return 1;
  const parcel = parcelById(p.parcelId);
  if (!parcel) return 1;
  const e = hoodMap(state).get(parcel.blockId);
  if (!e || e.n < 2) return 1;
  // Grannarna = kvarteret minus fastigheten själv.
  const avg = (e.sum - p.condition) / (e.n - 1);
  if (avg >= 75) return 1 + Math.min(0.04, (avg - 75) / 600);
  if (avg < 45) return 1 - Math.min(0.06, (45 - avg) / 500);
  return 1;
}
