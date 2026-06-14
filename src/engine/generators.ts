/* ============================================================
   Generatorer för hyresgäster, marknadsobjekt och tomter.
   Använder Math.random (samma beteende som prototypen).
   ============================================================ */

import { DISTRICTS, PROP_TYPES, TENANT_PROFILES } from "./data";
import { newId, pick, rnd } from "./random";
import type { GameState, Lot, Property, Tenant } from "./types";

/** Skapar en ny hyresgäst utifrån en slumpad profil. */
export function makeTenant(baseRent: number, demandMod: number): Tenant {
  const prof = pick(TENANT_PROFILES);
  const term = Math.round(rnd(prof.termMin, prof.termMax));
  return {
    id: newId(),
    profile: prof.id,
    name: prof.name,
    quality: prof.quality,
    defaultRisk: prof.defaultRisk,
    monthsLeft: term,
    termTotal: term,
    rent: Math.round((baseRent / 12) * prof.quality * (0.9 + demandMod * 0.1)),
  };
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
    tenant: null,
    status: "klar",
    buildLeft: 0,
  };
  // ~55 % chans att objektet redan har hyresgäst
  if (Math.random() < 0.55) p.tenant = makeTenant(p.baseRent, state.demandMod);
  return p;
}

/** Genererar en byggbar tomt till salu. */
export function genLot(state: GameState): Lot {
  const d = pick(DISTRICTS);
  const area = Math.round(rnd(600, 3500));
  const price = Math.round(area * d.base * 0.18 * state.marketMod);
  return { id: newId(), district: d.id, districtName: d.name, area, price };
}
