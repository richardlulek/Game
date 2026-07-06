/* ============================================================
   Finansfunktioner – lånevillkor, portföljvärde, LTV, eget kapital.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { propMarketValue } from "./property";
import type { GameState, LoanTerms } from "./types";

/** Reputationsbaserade lånevillkor (ränta, påslag, max belåningsgrad). */
export function loanTerms(state: GameState): LoanTerms {
  const rep = state.reputation;
  const spread = 2.5 - (rep / 100) * 1.7; // 0,8–2,5 % påslag
  const maxLtv = 0.6 + (rep / 100) * 0.2; // 60–80 %
  return {
    rate: +(state.interestRate + spread).toFixed(2),
    spread: +spread.toFixed(2),
    maxLtv,
  };
}

/** Summerat marknadsvärde för hela portföljen. */
export function portfolioValue(state: GameState): number {
  return state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
}

/** Eget kapital = kassa + fastighetsvärde − skuld. */
export function equityOf(state: GameState): number {
  return state.cash + portfolioValue(state) - state.debt;
}

/** Belåningsgrad (LTV). 0 om portföljen är tom. */
export function ltvOf(state: GameState): number {
  return state.portfolio.length ? state.debt / portfolioValue(state) : 0;
}
