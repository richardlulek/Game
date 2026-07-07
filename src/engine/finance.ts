/* ============================================================
   Finansfunktioner – lånevillkor, portföljvärde, LTV, eget kapital
   samt bundna lån (fast ränta) vid sidan av den rörliga skulden.
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

/** Total skuld = rörlig skuld + bundna lån. */
export function totalDebtOf(state: GameState): number {
  return state.debt + (state.fixedLoans ?? []).reduce((a, l) => a + l.amount, 0);
}

/** Månadens räntekostnad: rörlig ränta på debt + fast ränta på bundna lån. */
export function monthlyInterestOf(state: GameState): number {
  const varInterest = state.debt * (loanTerms(state).rate / 100);
  const fixedInterest = (state.fixedLoans ?? []).reduce((a, l) => a + l.amount * (l.rate / 100), 0);
  return (varInterest + fixedInterest) / 12;
}

/** Eget kapital = kassa + fastighetsvärde − total skuld. */
export function equityOf(state: GameState): number {
  return state.cash + portfolioValue(state) - totalDebtOf(state);
}

/** Belåningsgrad (LTV). 0 om portföljen är tom. */
export function ltvOf(state: GameState): number {
  return state.portfolio.length ? totalDebtOf(state) / portfolioValue(state) : 0;
}
