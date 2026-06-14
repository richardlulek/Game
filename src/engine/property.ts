/* ============================================================
   Fastighetsekonomi – rena, deterministiska funktioner.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { DISTRICTS, PROP_TYPES } from "./data";
import type { GameState, Property } from "./types";

/** Marknadsvärde för en fastighet givet nuvarande tillstånd. */
export function propMarketValue(p: Property, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  const condFactor = 0.6 + (p.condition / 100) * 0.6;
  let v = p.area * d.base * condFactor * state.marketMod * d.growth * p.valueMult;
  if (p.status === "bygger") v *= 0.5; // pågående bygge värderas lägre
  return v;
}

/** Faktisk årshyra (uthyrt = kontraktshyra, vakant = 0). */
export function propAnnualRent(p: Property, state: GameState): number {
  if (p.status === "bygger") return 0;
  const t = PROP_TYPES[p.type];
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  if (p.tenant) return p.tenant.rent * 12; // uthyrt: kontraktshyra
  // Vakant: ingen intäkt, men marknadspotential visas separat
  const gross = p.baseRent * p.rentMult * state.demandMod * d.demand * 1.2;
  const vacancy = Math.max(0, t.vacancyBase * p.vacancyMult - (p.condition - 60) / 1000);
  return 0 * gross * (1 - vacancy);
}

/** Marknadspotential för hyra om lokalen vore uthyrd. */
export function propPotentialRent(p: Property, state: GameState): number {
  const t = PROP_TYPES[p.type];
  const d = DISTRICTS.find((x) => x.id === p.district)!;

  // Klusterbonus: fler ägda fastigheter i samma distrikt ger hyresboost och lägre vakans
  const ownedInDistrict = state.portfolio.filter(
    (x) => x.district === p.district && x.status === "klar",
  ).length;
  const clusterRentMult = ownedInDistrict >= 5 ? 1.10 : ownedInDistrict >= 3 ? 1.05 : 1;
  const clusterVacMult  = ownedInDistrict >= 5 ? 0.85 : ownedInDistrict >= 3 ? 0.90 : 1;

  const gross = p.baseRent * p.rentMult * state.demandMod * d.demand * 1.2 * clusterRentMult;
  const vacancy = Math.max(0, t.vacancyBase * p.vacancyMult * clusterVacMult - (p.condition - 60) / 1000);
  return gross * (1 - vacancy);
}

/** Årlig driftkostnad. */
export function propAnnualOpex(p: Property, state: GameState): number {
  if (p.status === "bygger") return 0;
  const t = PROP_TYPES[p.type];
  return p.baseRent * t.opexFactor * p.opexMult * state.taxMod;
}

/** Driftnetto per år (hyra − driftkostnad). */
export function propNOI(p: Property, state: GameState): number {
  return propAnnualRent(p, state) - propAnnualOpex(p, state);
}
