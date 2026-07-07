/* ============================================================
   Distriktsöden – områdesutvecklingen (districtDev) får synliga
   statusnivåer med trösklar. Statusbyten är händelser i staden:
   gentrifiering lyfter, eftersatthet drar ned.
   Ren logik, inga React-beroenden.
   ============================================================ */

import type { GameState } from "./types";

export interface DistrictTier {
  id: string;
  name: string;
  icon: string;
  /** districtDev-tröskel (undre gräns). */
  min: number;
}

/** Nivåerna i stigande ordning. */
export const DISTRICT_TIERS: DistrictTier[] = [
  { id: "eftersatt", name: "Eftersatt", icon: "🚧", min: 0 },
  { id: "stabilt", name: "Stabilt", icon: "🏘️", min: 0.93 },
  { id: "uppatgaende", name: "Uppåtgående", icon: "📈", min: 1.1 },
  { id: "exklusivt", name: "Exklusivt", icon: "✨", min: 1.3 },
];

export function tierOfDev(dev: number): DistrictTier {
  let cur = DISTRICT_TIERS[0];
  for (const t of DISTRICT_TIERS) if (dev >= t.min) cur = t;
  return cur;
}

export function districtTier(state: GameState, district: string): DistrictTier {
  return tierOfDev(state.districtDev?.[district] ?? 1);
}

/** Nästa nivå uppåt, eller null på toppen. */
export function nextDistrictTier(tier: DistrictTier): DistrictTier | null {
  const i = DISTRICT_TIERS.findIndex((t) => t.id === tier.id);
  return DISTRICT_TIERS[i + 1] ?? null;
}
