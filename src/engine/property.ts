/* ============================================================
   Fastighetsekonomi – rena, deterministiska funktioner.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { DISTRICTS, PROP_TYPES } from "./data";
import type { GameState, Property } from "./types";

/** Marknadsvärde för en fastighet givet nuvarande tillstånd.
 *  Blandar substansvärde med inkomstvärde – hög beläggning och bra hyror
 *  driver upp värdet relativt ett tomt objekt.
 */
export function propMarketValue(p: Property, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  const condFactor = 0.6 + (p.condition / 100) * 0.6;
  const assetValue = p.area * d.base * condFactor * state.marketMod * d.growth * p.valueMult;

  if (p.status === "bygger") return assetValue * 0.5;

  // Inkomstvärde: NOI / cap rate (5.5 %)
  const noi = propNOI(p, state);
  const incomeValue = noi > 0 ? noi / 0.055 : 0;

  // Beläggningsgrad påverkar blandningsvikten mot inkomstvärdet
  const occupancy = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  // Vid 0 % beläggning: rent substansvärde; vid 100 %: 60/40 inkomst/substans
  const incomeWeight = occupancy * 0.6;
  const blended = assetValue * (1 - incomeWeight) + incomeValue * incomeWeight;

  // Hyrespremie/-rabatt relativt marknadspotential
  const potentialRent = propPotentialRent(p, state);
  const actualRent = propAnnualRent(p, state);
  const rentRatio = potentialRent > 0 && actualRent > 0 ? actualRent / potentialRent : 1;
  const rentMult = Math.max(0.90, Math.min(1.20, 0.95 + rentRatio * 0.25));

  return Math.round(blended * rentMult);
}

/** Faktisk årshyra (summa av alla hyresgästers kontraktshyra, vakant = 0). */
export function propAnnualRent(p: Property, _state: GameState): number {
  if (p.status === "bygger") return 0;
  if (p.tenants.length > 0) return p.tenants.reduce((s, t) => s + t.rent * 12, 0);
  return 0;
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
