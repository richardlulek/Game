/* ============================================================
   Finansfunktioner – lånevillkor, portföljvärde, LTV, eget kapital.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { propMarketValue } from "./property";
import { spreadDelta } from "./progression";
import { stockHoldingsValue, subsidiaryValue } from "./stocks";
import type { GameState, Lender, LoanTerms } from "./types";

export const LENDERS: Lender[] = [
  {
    id: "sparbanken",
    name: "Sparbanken",
    desc: "Konservativ lokal bank. Lägre ränta men snävare belåningsgrad.",
    rateBonus: -0.3,
    ltvBonus: -0.05,
    minReputation: 0,
  },
  {
    id: "investmentbank",
    name: "Investmentbanken",
    desc: "Aggressiv finansiering med hög belåningsgrad. Dyrare kapital.",
    rateBonus: 0.5,
    ltvBonus: 0.08,
    minReputation: 30,
  },
  {
    id: "nordisk_kapital",
    name: "Nordisk Kapital",
    desc: "Nordisk fastighetsfond. Bäst räntevillkor men kräver hög reputation.",
    rateBonus: -0.6,
    ltvBonus: 0.03,
    minReputation: 70,
  },
];

/** Reputationsbaserade lånevillkor (ränta, påslag, max belåningsgrad). */
export function loanTerms(state: GameState): LoanTerms {
  const rep = state.reputation;
  const spread = Math.max(0.3, 2.5 - (rep / 100) * 1.7 - spreadDelta(state));
  const baseLtv = 0.6 + (rep / 100) * 0.2;
  const lender = LENDERS.find((l) => l.id === state.selectedLender);
  const rateAdj = lender?.rateBonus ?? 0;
  const ltvAdj = lender?.ltvBonus ?? 0;
  const maxLtv = Math.max(0.5, Math.min(0.9, baseLtv + ltvAdj));
  return {
    rate: +(state.interestRate + spread + rateAdj).toFixed(2),
    spread: +(spread + rateAdj).toFixed(2),
    maxLtv,
  };
}

/** Summerat marknadsvärde för hela portföljen. */
export function portfolioValue(state: GameState): number {
  return state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
}

/** Eget kapital = kassa + fastighetsvärde + aktier + dotterbolag − skuld. */
export function equityOf(state: GameState): number {
  return (
    state.cash +
    portfolioValue(state) +
    stockHoldingsValue(state) +
    subsidiaryValue(state) -
    state.debt
  );
}

/** Belåningsgrad (LTV). 0 om portföljen är tom. */
export function ltvOf(state: GameState): number {
  return state.portfolio.length ? state.debt / portfolioValue(state) : 0;
}
