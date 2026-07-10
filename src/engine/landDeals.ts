/* ============================================================
   Markaffärer med privatpersoner – dekorhusen på kartan ägs av
   stadens invånare och allt har ett pris:

   · Varje dekorhus har en deterministisk profil (typ, yta, skick)
     ur tomt-hashen – kartan och affären är alltid överens.
   · Ägaren säljer mot premie över marknadsvärdet. Premien växer
     ju fler grannar i kvarteret du redan köpt (alla förstår vad
     du håller på med), och vissa ägare är nejsägare som kräver
     rejält betalt.

   Ren logik utan React-beroenden.
   ============================================================ */

import { locationFactor, parcelById, parcelHash, type Parcel } from "./city";
import { DISTRICTS, PROP_TYPES } from "./data";
import type { GameState, PropTypeKey } from "./types";

/** Fastighetstyp för ett dekorhus – speglar 3D-vyns typmix per distrikt. */
export function ambientTypeFor(parcel: Parcel): PropTypeKey {
  const seed = parcelHash(parcel.id) >> 3;
  switch (parcel.district) {
    case "finans": return "kontor";
    case "industri":
    case "hamnen": return "industri";
    case "centrum": return seed % 4 === 0 ? "kontor" : "bostad";
    case "innerstad": return seed % 3 === 0 ? "butik" : "bostad";
    default: return "bostad";
  }
}

export interface AmbientProfile {
  type: PropTypeKey;
  typeLabel: string;
  area: number;
  condition: number;
  /** Nejsägare: säljer bara mot rejäl överkurs. */
  holdout: boolean;
}

/** Deterministisk profil för det privatägda huset på tomten. */
export function ambientProfile(parcel: Parcel): AmbientProfile {
  const hash = parcelHash(parcel.id);
  const type = ambientTypeFor(parcel);
  // Yta ur tomtstorlek och ett par "våningar" ur hashen.
  const floors = 2 + (hash % 3);
  const area = Math.round(parcel.w * parcel.d * 0.55 * floors);
  const condition = 45 + ((hash >> 5) % 41); // 45–85: bebott men inte nytt
  return {
    type,
    typeLabel: PROP_TYPES[type].label,
    area,
    condition,
    holdout: hash % 6 === 0,
  };
}

/** Substansvärde för huset – basen som hyran räknas på (utan områdespremie). */
export function ambientValue(parcel: Parcel, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === parcel.district);
  if (!d) return 0;
  const prof = ambientProfile(parcel);
  const condFactor = 0.6 + (prof.condition / 100) * 0.6;
  const dev = state.districtDev?.[parcel.district] ?? 1;
  return Math.round(prof.area * d.base * condFactor * state.marketMod * dev);
}

/** Fullt marknadsvärde för huset – speglar propMarketValue (inkl. distriktets
 *  tillväxt och läget på kartan), så off market-premien blir en verklig
 *  överkurs i ALLA distrikt och köpet aldrig bokför gratis eget kapital. */
export function ambientMarketValue(parcel: Parcel, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === parcel.district);
  if (!d) return 0;
  return Math.round(ambientValue(parcel, state) * d.growth * locationFactor(parcel.id));
}

/** Antal tomter i kvarteret som spelaren redan äger (ryktet sprids). */
function ownedInBlock(state: GameState, blockId: string): number {
  return state.portfolio.filter((p) => {
    const pc = p.parcelId ? parcelById(p.parcelId) : undefined;
    return pc?.blockId === blockId;
  }).length;
}

export interface AmbientAsk {
  value: number;
  ask: number;
  premium: number;
  holdout: boolean;
}

/**
 * Ägarens begärda pris: off market-premie (+18 %), +6 % per granne
 * du redan köpt i kvarteret, och nejsägare kräver 50 % extra.
 */
export function ambientAsk(parcel: Parcel, state: GameState): AmbientAsk {
  // Premien läggs på det fulla marknadsvärdet (inkl. tillväxt och läge), inte
  // bara substansvärdet – annars kunde köp i högtillväxtdistrikt (t.ex. Hamnen)
  // ändå ge ~14 % gratis övervärde direkt.
  const value = ambientMarketValue(parcel, state);
  const prof = ambientProfile(parcel);
  const neighbors = ownedInBlock(state, parcel.blockId);
  let premium = 1.18 + neighbors * 0.06;
  if (prof.holdout) premium *= 1.5;
  const ask = Math.round((value * premium) / 10_000) * 10_000;
  return { value, ask, premium, holdout: prof.holdout };
}
