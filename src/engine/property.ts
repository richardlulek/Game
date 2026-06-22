/* ============================================================
   Fastighetsekonomi – rena, deterministiska funktioner.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { DISTRICTS, PROP_TYPES } from "./data";
import { opexMult, vacancyMult } from "./progression";
import { energySynergyMult } from "./industries";
import type { GameState, Property } from "./types";

/** Områdesutvecklingsfaktor – stiger när distriktet bebyggs (1.0 = neutral). */
export function districtDevOf(state: GameState, district: string): number {
  return state.districtDev?.[district] ?? 1;
}

/** Marknadsvärde för en fastighet givet nuvarande tillstånd.
 *  Substansvärde som bas, med premie för beläggning och hyresnivå.
 *  Vakant fastighet = substansvärde (aldrig rabatterat).
 *  Fullt uthyrd vid marknadshyra = substansvärde + 10 %.
 */
export function propMarketValue(p: Property, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === p.district)!;
  const condFactor = 0.6 + (p.condition / 100) * 0.6;
  const dev = districtDevOf(state, p.district);
  const assetValue = p.area * d.base * condFactor * state.marketMod * d.growth * p.valueMult * dev;

  if (p.status === "bygger") return Math.round(assetValue * 0.5);

  // Beläggningspremie: 0 % → ×1.0, 100 % → ×1.10
  const occupancy = p.capacity > 0 ? p.tenants.length / p.capacity : 0;
  const occupancyMult = 1.0 + occupancy * 0.10;

  // Hyrespremie: jämför faktisk hyra mot proportionell marknadspotential
  // Överpris → upp till +5 %, underpris → ned till −5 %
  let rentMult = 1.0;
  if (occupancy > 0) {
    const potentialRent = propPotentialRent(p, state);
    const actualRent    = propAnnualRent(p, state);
    if (potentialRent > 0) {
      const rentRatio = actualRent / (potentialRent * occupancy);
      rentMult = Math.max(0.95, Math.min(1.05, 1.0 + (rentRatio - 1) * 0.25));
    }
  }

  return Math.round(assetValue * occupancyMult * rentMult);
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

  // Logistiksynergi: logistiktillgångar i samma distrikt höjer industrifastigheters hyra
  const logistikInDistrict = (state.industryPortfolio ?? []).filter(
    (a) => a.sector === "logistik" && a.district === p.district && a.status === "klar",
  ).length;
  const logistikBonus = p.type === "industri" ? 1 + logistikInDistrict * 0.03 : 1.0;

  // Områdesutveckling lyfter hyran (halv effekt mot värdet).
  const devRent = 1 + (districtDevOf(state, p.district) - 1) * 0.5;
  const gross = p.baseRent * p.rentMult * state.demandMod * d.demand * 1.2 * clusterRentMult * devRent * logistikBonus;
  const vacancy = Math.max(
    0,
    t.vacancyBase * p.vacancyMult * clusterVacMult * vacancyMult(state) - (p.condition - 60) / 1000,
  );
  return gross * (1 - vacancy);
}

/** Årlig driftkostnad. */
export function propAnnualOpex(p: Property, state: GameState): number {
  if (p.status === "bygger") return 0;
  const t = PROP_TYPES[p.type];
  return p.baseRent * t.opexFactor * p.opexMult * state.taxMod * opexMult(state) * energySynergyMult(state);
}

/** Driftnetto per år (hyra − driftkostnad). */
export function propNOI(p: Property, state: GameState): number {
  return propAnnualRent(p, state) - propAnnualOpex(p, state);
}
