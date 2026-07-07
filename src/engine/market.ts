/* ============================================================
   Marknadsmekanik – auktioner på marknadsobjekt samt värdering,
   köp och överlåtelse av konkurrentinnehav. Delas av reducern
   (spelarens actions) och simulationen (konkurrenternas drag).
   ============================================================ */

import { locationFactor } from "./city";
import { DISTRICTS, PROP_TYPES } from "./data";
import { loanTerms } from "./finance";
import { msek } from "./format";
import { makeTenant } from "./generators";
import { devValueFactor, districtDev } from "./property";
import { newId, rnd } from "./random";
import type { GameState, Property, RivalHolding } from "./types";

/** Nästa giltiga budnivå i en auktion. */
export function nextBidAmount(p: Property): number {
  return Math.round(p.bestBid ? p.bestBid.amount * 1.05 : p.askPrice);
}

/** Pris för att köpa direkt och avbryta auktionen. */
export function buyNowPrice(p: Property): number {
  return Math.round(Math.max(p.askPrice * 1.15, (p.bestBid?.amount ?? 0) * 1.1));
}

/**
 * Genomför köp av ett marknadsobjekt till angivet pris (handpenning +
 * lån enligt maxLtv). Returnerar null om kassan inte räcker.
 */
export function purchaseListing(state: GameState, p: Property, price: number): GameState | null {
  const { maxLtv } = loanTerms(state);
  const down = price * (1 - maxLtv);
  if (state.cash < down) return null;
  const loan = price - down;
  const owned: Property = {
    ...p,
    owned: true,
    purchasePrice: price,
    auctionMonthsLeft: 0,
    bestBid: null,
    maintenance: "normal",
    prospects: [],
  };
  return {
    ...state,
    cash: state.cash - down,
    debt: state.debt + loan,
    reputation: Math.min(100, state.reputation + 1),
    portfolio: [...state.portfolio, owned],
    listings: state.listings.filter((x) => x.id !== p.id),
    log: [
      {
        t: `Köpte ${p.typeLabel} i ${p.districtName} för ${msek(price)} (lån ${msek(loan)}).`,
        kind: "buy" as const,
        parcelId: p.parcelId,
      },
      ...state.log,
    ],
  };
}

/** Flyttar ett marknadsobjekt till en konkurrents innehav. */
export function transferListingToRival(
  state: GameState,
  p: Property,
  rivalName: string,
): GameState {
  return {
    ...state,
    listings: state.listings.filter((x) => x.id !== p.id),
    competitors: state.competitors.map((c) => {
      if (c.name !== rivalName) return c;
      const holdings = [
        ...c.holdings,
        {
          id: p.id,
          parcelId: p.parcelId,
          district: p.district,
          districtName: p.districtName,
          type: p.type,
          typeLabel: p.typeLabel,
          area: p.area,
        },
      ];
      return {
        ...c,
        holdings,
        units: holdings.length,
        cash: Math.max(0, c.cash - p.askPrice * 0.25),
      };
    }),
  };
}

/** Uppskattat marknadsvärde för ett konkurrentinnehav (skick okänt ⇒ antas 75). */
export function holdingValue(h: RivalHolding, state: GameState): number {
  const d = DISTRICTS.find((x) => x.id === h.district)!;
  return (
    h.area *
    d.base *
    1.05 * // condFactor vid skick 75
    state.marketMod *
    d.growth *
    locationFactor(h.parcelId) *
    devValueFactor(districtDev(state, h.district))
  );
}

/** Budpremie för att försöka köpa loss ett enskilt konkurrentinnehav. */
export function holdingBidPrice(h: RivalHolding, state: GameState): number {
  return Math.round(holdingValue(h, state) * 1.15);
}

/** Skapar en spelbar fastighet av ett konkurrentinnehav som köpts loss. */
export function propertyFromHolding(
  h: RivalHolding,
  state: GameState,
  purchasePrice: number,
): Property {
  const t = PROP_TYPES[h.type];
  const condition = Math.round(rnd(55, 85));
  const value = holdingValue(h, state);
  const baseRent = Math.round(value * t.rentFactor * 12 * (0.7 + (condition / 100) * 0.5));
  const p: Property = {
    id: newId(),
    district: h.district,
    districtName: h.districtName,
    parcelId: h.parcelId,
    type: h.type,
    typeLabel: h.typeLabel,
    area: h.area,
    condition,
    askPrice: Math.round(value),
    purchasePrice,
    baseRent,
    upgrades: [],
    owned: true,
    rentMult: 1,
    opexMult: 1,
    vacancyMult: 1,
    valueMult: 1,
    tenant: null,
    status: "klar",
    buildLeft: 0,
    maintenance: "normal",
    prospects: [],
    auctionMonthsLeft: 0,
    bestBid: null,
  };
  // Övertagna hus har ofta sittande hyresgäst.
  if (Math.random() < 0.6) p.tenant = makeTenant(p.baseRent, state.demandMod);
  return p;
}
