/* ============================================================
   Generatorer för hyresgäster, marknadsobjekt, tomter och
   konkurrentinnehav. Använder Math.random (samma beteende som
   prototypen). Objekt placeras på lediga tomtrutor i upplåsta
   distrikt. Skicka in ett delat occupied-set när flera objekt
   genereras i följd, annars härleds det ur tillståndet per anrop.
   ============================================================ */

import { claimRandomParcel, districtsWithFreeParcels, locationFactor, usedParcelIds } from "./city";
import { DISTRICTS, DISTRICT_ZONING, PROP_TYPES, START_DISTRICTS, TENANT_PROFILES } from "./data";
import { newId, pick, rnd } from "./random";
import type { District, GameState, Lot, Property, RivalHolding, Tenant } from "./types";

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

/** Slumpar ett upplåst distrikt som fortfarande har lediga tomtrutor. */
function pickDistrict(occupied: Set<string>, unlocked: string[]): District {
  const open = unlocked?.length ? unlocked : START_DISTRICTS;
  const free = districtsWithFreeParcels(occupied).filter((d) => open.includes(d));
  if (!free.length) return DISTRICTS.find((x) => x.id === pick(open))!;
  const id = pick(free);
  return DISTRICTS.find((x) => x.id === id)!;
}

/** Genererar ett marknadsobjekt till salu. */
export function genListing(
  state: GameState,
  occupied: Set<string> = usedParcelIds(state),
): Property {
  const d = pickDistrict(occupied, state.unlockedDistricts);
  const parcel = claimRandomParcel(d.id, occupied);
  // Detaljplanen styr vilka typer som byggs i distriktet.
  const typeKeys = DISTRICT_ZONING[d.id] ?? (Object.keys(PROP_TYPES) as Property["type"][]);
  const typeKey = pick(typeKeys);
  const t = PROP_TYPES[typeKey];
  const area = Math.round(rnd(400, 4500));
  const condition = Math.round(rnd(35, 95));
  const condFactor = 0.6 + (condition / 100) * 0.6;
  const value =
    area * d.base * condFactor * state.marketMod * rnd(0.9, 1.12) * locationFactor(parcel.id);
  const annualRent = value * t.rentFactor * 12 * (0.7 + (condition / 100) * 0.5);
  const p: Property = {
    id: newId(),
    district: d.id,
    districtName: d.name,
    parcelId: parcel.id,
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
    maintenance: "normal",
    prospects: [],
    // Marknadsobjekt säljs via auktion med tidsfrist.
    auctionMonthsLeft: 3 + Math.floor(rnd(0, 3)),
    bestBid: null,
  };
  // ~55 % chans att objektet redan har hyresgäst
  if (Math.random() < 0.55) p.tenant = makeTenant(p.baseRent, state.demandMod);
  return p;
}

/** Genererar en byggbar tomt till salu. */
export function genLot(state: GameState, occupied: Set<string> = usedParcelIds(state)): Lot {
  const d = pickDistrict(occupied, state.unlockedDistricts);
  const parcel = claimRandomParcel(d.id, occupied);
  const area = Math.round(rnd(600, 3500));
  const price = Math.round(area * d.base * 0.18 * state.marketMod * locationFactor(parcel.id));
  return { id: newId(), district: d.id, districtName: d.name, parcelId: parcel.id, area, price };
}

/** Genererar ett konkurrentinnehav på en ledig tomtruta. */
export function genRivalHolding(unlocked: string[], occupied: Set<string>): RivalHolding {
  const d = pickDistrict(occupied, unlocked);
  const parcel = claimRandomParcel(d.id, occupied);
  const typeKeys = Object.keys(PROP_TYPES) as RivalHolding["type"][];
  const typeKey = pick(typeKeys);
  return {
    id: newId(),
    parcelId: parcel.id,
    district: d.id,
    districtName: d.name,
    type: typeKey,
    typeLabel: PROP_TYPES[typeKey].label,
    area: Math.round(rnd(500, 3200)),
  };
}
