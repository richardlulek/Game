/* ============================================================
   Fastighetsekonomi – rena, deterministiska funktioner.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { locationFactor } from "./city";
import { DISTRICTS, MAINTENANCE_LEVELS, PROP_TYPES } from "./data";
import type { GameState, Property } from "./types";

/** Distriktets utvecklingsindex (50 = neutral). */
export function districtDev(state: GameState, district: string): number {
  return state.districtDev?.[district] ?? 50;
}

/** Gentrifieringens effekt på marknadsvärde (1,0 vid index 50). */
export const devValueFactor = (dev: number): number => 0.9 + (dev / 100) * 0.2;

/** Gentrifieringens effekt på hyrespotential (1,0 vid index 50). */
export const devRentFactor = (dev: number): number => 0.85 + (dev / 100) * 0.3;

/** Marknadsvärde för en fastighet givet nuvarande tillstånd. */
export function propMarketValue(p: Property, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  const condFactor = 0.6 + (p.condition / 100) * 0.6;
  let v =
    p.area *
    d.base *
    condFactor *
    state.marketMod *
    d.growth *
    p.valueMult *
    locationFactor(p.parcelId) *
    devValueFactor(districtDev(state, p.district));
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
  const gross =
    p.baseRent *
    p.rentMult *
    state.demandMod *
    d.demand *
    1.2 *
    locationFactor(p.parcelId) *
    devRentFactor(districtDev(state, p.district));
  const vacancy = Math.max(0, t.vacancyBase * p.vacancyMult - (p.condition - 60) / 1000);
  return gross * (1 - vacancy);
}

/** Årlig driftkostnad (inkl. vald underhållsnivå). */
export function propAnnualOpex(p: Property, state: GameState): number {
  if (p.status === "bygger") return 0;
  const t = PROP_TYPES[p.type];
  const maint = MAINTENANCE_LEVELS[p.maintenance ?? "normal"].opexMult;
  return p.baseRent * t.opexFactor * p.opexMult * state.taxMod * maint;
}

/** Driftnetto per år (hyra − driftkostnad). */
export function propNOI(p: Property, state: GameState): number {
  return propAnnualRent(p, state) - propAnnualOpex(p, state);
}
