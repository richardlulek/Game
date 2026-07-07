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

/** Alla kvarter som spelaren äger i sin helhet (varje tomt = ägd fastighet). */
export function fullyOwnedBlocks(state: GameState): string[] {
  const ownedParcels = new Set(
    state.portfolio.filter((p) => p.parcelId).map((p) => p.parcelId!),
  );
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
  if (!p.parcelId) return null;
  const parcel = parcelById(p.parcelId);
  if (!parcel) return null;
  const parcelIds = BLOCK_PARCELS.get(parcel.blockId);
  if (!parcelIds) return null;
  const ownedParcels = new Set(
    state.portfolio.filter((x) => x.parcelId).map((x) => x.parcelId!),
  );
  return parcelIds.filter((id) => !ownedParcels.has(id)).length;
}
