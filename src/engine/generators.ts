/* ============================================================
   Generatorer för hyresgäster, marknadsobjekt och tomter.
   Använder Math.random (samma beteende som prototypen).
   ============================================================ */

import { DISTRICTS, PROP_TYPES, TENANT_NAMES, TENANT_PROFILES } from "./data";
import { newId, pick, rnd } from "./random";
import type { GameState, Lot, Property, Tenant } from "./types";

/** Skapar en ny hyresgäst utifrån en slumpad profil.
 *  condition-parametern filtrerar bort profiler som kräver bättre skick.
 *  - condition < 40: only "privat" and "startup"
 *  - condition < 60: exclude "stat"
 *  - condition >= 60: all profiles eligible
 */
export function makeTenant(baseRent: number, demandMod: number, condition: number = 70): Tenant {
  let eligible = TENANT_PROFILES;
  if (condition < 40) {
    eligible = TENANT_PROFILES.filter((p) => p.id === "privat" || p.id === "startup");
  } else if (condition < 60) {
    eligible = TENANT_PROFILES.filter((p) => p.id !== "stat");
  }
  // Fall back to all profiles if filtered list is empty
  if (eligible.length === 0) eligible = TENANT_PROFILES;
  const prof = pick(eligible);
  const term = Math.round(rnd(prof.termMin, prof.termMax));
  const names = TENANT_NAMES[prof.id] ?? [prof.name];
  return {
    id: newId(),
    profile: prof.id,
    name: pick(names),
    profileName: prof.name,
    quality: prof.quality,
    defaultRisk: prof.defaultRisk,
    monthsLeft: term,
    termTotal: term,
    rent: Math.round((baseRent / 12) * prof.quality * (0.9 + demandMod * 0.1)),
  };
}

/** Beräknar maxantal hyresgäster baserat på yta. */
export function calcCapacity(area: number): number { return Math.min(4, Math.floor(area / 1000) + 1); }

export const absMonth = (state: GameState) => state.year * 12 + state.month;

/** Genererar en fastighet för världspoolen (off-market, ingen datumstämpel). */
export function genWorldProperty(state: GameState): Property {
  const d = pick(DISTRICTS);
  const typeKeys = Object.keys(PROP_TYPES) as Property["type"][];
  const typeKey = pick(typeKeys);
  const t = PROP_TYPES[typeKey];
  const area = Math.round(rnd(400, 4500));
  const condition = Math.round(rnd(30, 95));
  const condFactor = 0.6 + (condition / 100) * 0.6;
  const value = area * d.base * condFactor * state.marketMod * rnd(0.85, 1.15);
  const annualRent = value * t.rentFactor * 12 * (0.7 + (condition / 100) * 0.5);
  const p: Property = {
    id: newId(),
    district: d.id,
    districtName: d.name,
    type: typeKey,
    typeLabel: t.label,
    area,
    condition,
    askPrice: Math.round(value),
    baseRent: Math.round(annualRent),
    upgrades: [],
    owned: false,
    rentMult: 1,
    opexMult: 1,
    vacancyMult: 1,
    valueMult: 1,
    tenants: [],
    capacity: calcCapacity(area),
    status: "klar",
    buildLeft: 0,
  };
  if (Math.random() < 0.4) p.tenants.push(makeTenant(annualRent / p.capacity, state.demandMod, condition));
  return p;
}

/** Genererar ett marknadsobjekt till salu. */
export function genListing(state: GameState): Property {
  const d = pick(DISTRICTS);
  const typeKeys = Object.keys(PROP_TYPES) as Property["type"][];
  const typeKey = pick(typeKeys);
  const t = PROP_TYPES[typeKey];
  const area = Math.round(rnd(400, 4500));
  const condition = Math.round(rnd(35, 95));
  const condFactor = 0.6 + (condition / 100) * 0.6;
  const value = area * d.base * condFactor * state.marketMod * rnd(0.9, 1.12);
  const annualRent = value * t.rentFactor * 12 * (0.7 + (condition / 100) * 0.5);
  const born = absMonth(state);
  const p: Property = {
    id: newId(),
    district: d.id,
    districtName: d.name,
    type: typeKey,
    typeLabel: t.label,
    area,
    condition,
    askPrice: Math.round(value),
    baseRent: Math.round(annualRent),
    upgrades: [],
    owned: false,
    rentMult: 1,
    opexMult: 1,
    vacancyMult: 1,
    valueMult: 1,
    tenants: [],
    capacity: calcCapacity(area),
    status: "klar",
    buildLeft: 0,
    listedMonth: born,
    expiresMonth: born + 3 + Math.floor(Math.random() * 2),
  };
  // ~55 % chans att objektet redan har hyresgäst
  if (Math.random() < 0.55) p.tenants.push(makeTenant(annualRent / p.capacity, state.demandMod, condition));
  return p;
}

/** Genererar en byggbar tomt till salu. */
export function genLot(state: GameState): Lot {
  const d = pick(DISTRICTS);
  const area = Math.round(rnd(600, 3500));
  const price = Math.round(area * d.base * 0.18 * state.marketMod);
  const born = absMonth(state);
  return {
    id: newId(),
    district: d.id,
    districtName: d.name,
    area,
    price,
    listedMonth: born,
    expiresMonth: born + 3 + Math.floor(Math.random() * 2),
  };
}
