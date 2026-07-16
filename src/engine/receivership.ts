/* ============================================================
   Företagsrekonstruktion – när kassan faller under konkursgolvet
   pausar spelet och spelaren väljer själv vilka tillgångar som ska
   säljas för att återställa likviditeten. Agens lönar sig:
     · sälj själv i förväg  → snabbförsäljning −15 % (selling.ts)
     · välj i rekonstruktionsmenyn → −25 % (RECEIVER_CHOICE_FACTOR)
     · låt förvaltaren välja/ignorera → −35 % (RECEIVER_AUTO_FACTOR)
   Konkurs (game over) först när inte ens full likvidering kan lyfta
   kassan över golvet – äkta insolvens. Ren logik, inga React-beroenden.
   ============================================================ */

import { msek } from "./format";
import { propMarketValue } from "./property";
import { random01 } from "./random";
import type { GameState, Property } from "./types";

/** Spelarvalda försäljningar i menyn: −25 % mot marknadsvärde. */
export const RECEIVER_CHOICE_FACTOR = 0.75;
/** Förvaltarens automatiska dumpning: −35 % mot marknadsvärde. */
export const RECEIVER_AUTO_FACTOR = 0.65;
/** Kassagolvet som utlöser rekonstruktionen. */
export const BANKRUPTCY_FLOOR = -1_000_000;

/* ── Engångssmällen vid inträdet (delas av simulation + modal) ────── */
/** Ryktesförlust när rekonstruktionen blir offentlig. */
export const RECEIVERSHIP_REP_HIT = 10;
/** Bankförtroendet (standing) rasar. */
export const RECEIVERSHIP_BANK_HIT = 30;
/** Pressen vädrar blod (göder skandalsystemet). */
export const RECEIVERSHIP_PRESS_HIT = 6;

/* ── Bankens efterkrav: rekonstruktionsvillkor ────────────────────── */
/** Villkorens längd i månader efter att krisen lösts. */
export const RESTRUCTURING_MONTHS = 24;
/** Tvångsamortering: +2 pp/år UTÖVER trappan – och minst 2 %/år även
 *  under 50 % LTV. Banken vill ha tillbaka sina pengar. */
export const RESTRUCTURING_EXTRA_AMORT = 0.02;
/** Nyutlåningen stryps: maxbelåningsgraden sänks med 10 pp. */
export const RESTRUCTURING_LTV_PENALTY = 0.10;

/** Är bolaget under bankens rekonstruktionsvillkor just nu? */
export function underRestructuringTerms(state: GameState): boolean {
  const until = state.restructuringTerms?.untilAbs;
  return until != null && state.year * 12 + state.month < until;
}

/** Månader kvar av villkoren (0 om inga/utgångna). */
export function restructuringMonthsLeft(state: GameState): number {
  const until = state.restructuringTerms?.untilAbs;
  return until != null ? Math.max(0, until - (state.year * 12 + state.month)) : 0;
}

/** Villkoren som sätts när rekonstruktionen löses (oavsett väg). */
export function imposeRestructuringTerms(state: GameState): GameState {
  return {
    ...state,
    restructuringTerms: { untilAbs: state.year * 12 + state.month + RESTRUCTURING_MONTHS },
  };
}

export interface DistressQuote {
  value: number;
  salePrice: number;
  payoff: number;
  /** Netto till kassan: pris − skuldavbetalning. */
  net: number;
}

/** Stökprisoffert för en fastighet vid given rabattfaktor. */
export function distressQuote(p: Property, state: GameState, factor: number): DistressQuote {
  const value = propMarketValue(p, state);
  const salePrice = Math.round(value * factor);
  const payoff = Math.min(state.debt, (p.purchasePrice || salePrice) * 0.6);
  return { value, salePrice, payoff, net: salePrice - payoff };
}

/** Kan fastigheten säljas i rekonstruktionen? (Morfars hus skyddas av 7b.) */
export function canSellInReceivership(p: Property, state: GameState): boolean {
  return !(p.storyTag === "arvet" && state.story && !state.story.done);
}

/** Fastigheter som förvaltaren/menyn kan sälja. */
export function sellableInReceivership(state: GameState): Property[] {
  return state.portfolio.filter((p) => canSellInReceivership(p, state));
}

/** Maximalt netto som kan resas genom att sälja ALLT till förvaltarpris.
 *  OBS: payoff räknas per objekt mot nuvarande skuld – en övre gräns. */
export function maxRaisable(state: GameState): number {
  let debt = state.debt;
  let raised = 0;
  // Bäst netto först – samma ordning som auto-likvideringen.
  const quotes = sellableInReceivership(state)
    .map((p) => ({ p, value: propMarketValue(p, state) }))
    .sort((a, b) => b.value - a.value);
  for (const { p, value } of quotes) {
    const salePrice = Math.round(value * RECEIVER_AUTO_FACTOR);
    const payoff = Math.min(debt, (p.purchasePrice || salePrice) * 0.6);
    raised += salePrice - payoff;
    debt = Math.max(0, debt - payoff);
  }
  return raised;
}

/** Äkta insolvens: inte ens full likvidering lyfter kassan över golvet. */
export function isInsolvent(state: GameState): boolean {
  return state.cash + maxRaisable(state) < BANKRUPTCY_FLOOR;
}

/** Tillämpar EN stökförsäljning på tillståndet (muterar en kopia av fälten
 *  på ett redan-kopierat tillstånd, i simulationens stil). Fastigheten
 *  återannonseras till fullt värde så huset står kvar på kartan. */
export function applyDistressSale(
  s: GameState,
  p: Property,
  factor: number,
  party: string,
): GameState {
  const q = distressQuote(p, s, factor);
  const born = s.year * 12 + s.month;
  return {
    ...s,
    cash: s.cash + q.net,
    debt: Math.max(0, s.debt - q.payoff),
    portfolio: s.portfolio.filter((x) => x.id !== p.id),
    listings: [
      ...s.listings,
      {
        ...p, owned: false, askPrice: q.value,
        listedMonth: born, expiresMonth: born + 3 + Math.floor(random01() * 2),
        txHistory: [...(p.txHistory ?? []), { type: "sold" as const, price: q.salePrice, month: s.month, year: s.year, party }],
        poolAskPrice: undefined, poolBaseRent: undefined, applications: undefined,
        askRentPct: undefined, regulated: undefined, brokerMandate: undefined,
        capexTotal: undefined, forSale: undefined,
      },
    ],
    pendingRenewals: (s.pendingRenewals ?? []).filter((r) => r.propertyId !== p.id),
    salePackages: (s.salePackages ?? [])
      .map((pkg) => ({ ...pkg, propertyIds: pkg.propertyIds.filter((id) => id !== p.id) }))
      .filter((pkg) => pkg.propertyIds.length > 0),
  };
}

/** Förvaltarens automatiska likvidering: säljer bäst-netto-först till
 *  −35 % tills kassan är över noll (eller inget mer kan säljas för
 *  positivt netto). Returnerar nytt tillstånd + antal sålda. */
export function receiverAutoLiquidate(state: GameState): { state: GameState; sold: number } {
  let s = state;
  let sold = 0;
  for (;;) {
    if (s.cash >= 0) break;
    const best = sellableInReceivership(s)
      .map((p) => ({ p, q: distressQuote(p, s, RECEIVER_AUTO_FACTOR) }))
      .sort((a, b) => b.q.net - a.q.net)[0];
    if (!best || best.q.net <= 0) break;
    s = applyDistressSale(s, best.p, RECEIVER_AUTO_FACTOR, "Receiver (distress sale)");
    s = {
      ...s,
      log: [
        { t: `🧾 Receivership: forced distress sale of ${best.p.typeLabel} in ${best.p.districtName} for ${msek(best.q.salePrice)} (−35% vs. value) to cover the shortfall.`, kind: "warn" as const },
        ...s.log,
      ],
    };
    sold++;
  }
  return { state: s, sold };
}
