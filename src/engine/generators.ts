/* ============================================================
   Generatorer för hyresgäster, marknadsobjekt och tomter.
   Använder Math.random (samma beteende som prototypen).
   ============================================================ */

import { DISTRICTS, DISTRICT_GEN, PROP_TYPES, TENANT_NAMES, TENANT_PROFILES } from "./data";
import { newId, pick, rnd } from "./random";
import type { District, GameState, Lot, Property, PropTypeKey, Tenant } from "./types";

/** Viktad slumpning av distrikt (vikterna speglar tomtantal per zon).
 *  Med `allowed` begränsas valet till distrikt med ledig mark, så att
 *  nyproduktion aldrig behöver tränga undan befintliga hus. */
function pickDistrict(allowed?: ReadonlySet<string>): District {
  const pool =
    allowed && allowed.size > 0 ? DISTRICTS.filter((d) => allowed.has(d.id)) : DISTRICTS;
  const list = pool.length > 0 ? pool : DISTRICTS;
  const total = list.reduce((a, d) => a + (DISTRICT_GEN[d.id]?.weight ?? 10), 0);
  let r = Math.random() * total;
  for (const d of list) {
    r -= DISTRICT_GEN[d.id]?.weight ?? 10;
    if (r <= 0) return d;
  }
  return list[0];
}

/** Viktad fastighetstyp enligt distriktets profil. */
function pickType(district: string): PropTypeKey {
  const prof = DISTRICT_GEN[district];
  if (!prof) return pick(Object.keys(PROP_TYPES) as PropTypeKey[]);
  const total = prof.types.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of prof.types) {
    r -= w;
    if (r <= 0) return t;
  }
  return prof.types[0][0];
}

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

/** Beräknar maxantal hyresgäster baserat på yta.
 *  Hela kvarter (förortsmodellen) rymmer betydligt fler hushåll. */
export function calcCapacity(area: number, wholeBlock = false): number {
  if (wholeBlock) return Math.min(9, Math.floor(area / 700) + 2);
  return Math.min(4, Math.floor(area / 1000) + 1);
}

/** ESG-energiklass utifrån skick (bättre skick = bättre klass). */
export function energyClassFor(condition: number): Property["energyClass"] {
  const classes = ["F", "E", "D", "C", "B", "A"] as const;
  return classes[Math.min(5, Math.floor(condition / 17))];
}

/** Ungefärligt byggår utifrån skick – sämre skick betyder äldre hus. */
export function builtYearFor(condition: number, currentYear: number): number {
  return currentYear - Math.round((100 - condition) * 0.35);
}

export const absMonth = (state: GameState) => state.year * 12 + state.month;

/** Gemensam kärna: distriktsprofilstyrd fastighet. */
function genProperty(
  state: GameState,
  priceJitter: [number, number],
  condMin: number,
  allowed?: ReadonlySet<string>,
): Property {
  const d = pickDistrict(allowed);
  const prof = DISTRICT_GEN[d.id];
  const typeKey = pickType(d.id);
  const t = PROP_TYPES[typeKey];
  const wholeBlock = prof?.wholeBlock ?? false;
  const area = Math.round(rnd(prof?.areaMin ?? 400, prof?.areaMax ?? 4500));
  const condition = Math.round(rnd(condMin, 95));
  const condFactor = 0.6 + (condition / 100) * 0.6;
  const value = area * d.base * condFactor * state.marketMod * rnd(priceJitter[0], priceJitter[1]);
  const annualRent = value * t.rentFactor * 12 * (0.7 + (condition / 100) * 0.5);

  const p: Property = {
    id: newId(),
    district: d.id,
    districtName: d.name,
    type: typeKey,
    typeLabel: wholeBlock ? `Kvarter · ${t.label}` : t.label,
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
    capacity: calcCapacity(area, wholeBlock),
    status: "klar",
    buildLeft: 0,
    energyClass: energyClassFor(condition),
    builtYear: builtYearFor(condition, state.year),
    ...(wholeBlock ? { wholeBlock: true } : {}),
  };
  return p;
}

/** Genererar en fastighet för världspoolen (off-market, ingen datumstämpel). */
export function genWorldProperty(state: GameState, allowed?: ReadonlySet<string>): Property {
  const p = genProperty(state, [0.85, 1.15], 30, allowed);
  if (Math.random() < 0.4)
    p.tenants.push(makeTenant(p.baseRent / p.capacity, state.demandMod, p.condition));
  return p;
}

/** Genererar ett marknadsobjekt till salu. */
export function genListing(state: GameState, allowed?: ReadonlySet<string>): Property {
  const p = genProperty(state, [0.9, 1.12], 35, allowed);
  const born = absMonth(state);
  p.listedMonth = born;
  p.expiresMonth = born + 3 + Math.floor(Math.random() * 2);
  // ~55 % chans att objektet redan har hyresgäst
  if (Math.random() < 0.55)
    p.tenants.push(makeTenant(p.baseRent / p.capacity, state.demandMod, p.condition));
  return p;
}

/** Genererar en byggbar tomt till salu. */
export function genLot(state: GameState, allowed?: ReadonlySet<string>): Lot {
  const d = pickDistrict(allowed);
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
