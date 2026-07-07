/* ============================================================
   Finansfunktioner – lånevillkor, portföljvärde, LTV, eget kapital.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { esgRatingOf } from "./esg";
import { propMarketValue } from "./property";
import { spreadDelta } from "./progression";
import { stockHoldingsValue, subsidiaryValue } from "./stocks";
import { industryAssetValue } from "./industries";
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

/** Reputationsbaserade lånevillkor (ränta, påslag, max belåningsgrad).
 *  ESG-betyget justerar påslaget: gröna lån (A/B) ger rabatt, E/F påslag. */
export function loanTerms(state: GameState): LoanTerms {
  const rep = state.reputation;
  const advisorBonus = (state.advisors ?? []).includes("kapitalstrateg") ? 0.2 : 0;
  const esg = esgRatingOf(state).spreadDelta;
  const spread = Math.max(0.1, Math.max(0.3, 2.5 - (rep / 100) * 1.7 - spreadDelta(state) - advisorBonus) + esg);
  const baseLtv = 0.55 + (rep / 100) * 0.19;
  const lender = LENDERS.find((l) => l.id === state.selectedLender);
  const rateAdj = lender?.rateBonus ?? 0;
  const ltvAdj = lender?.ltvBonus ?? 0;
  const maxLtv = Math.max(0.5, Math.min(0.85, baseLtv + ltvAdj));
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

/** Summerat marknadsvärde för industritillgångar. */
export function industryPortfolioValue(state: GameState): number {
  return (state.industryPortfolio ?? []).reduce((a, asset) => a + industryAssetValue(asset, state), 0);
}

/** Eget kapital = kassa + fastighetsvärde + industrivärde + aktier + dotterbolag − skuld. */
export function equityOf(state: GameState): number {
  return (
    state.cash +
    portfolioValue(state) +
    industryPortfolioValue(state) +
    stockHoldingsValue(state) +
    subsidiaryValue(state) -
    state.debt
  );
}

/** Belåningsgrad (LTV). 0 om portföljen är tom. Inkluderar revolverande kredit. */
export function ltvOf(state: GameState): number {
  const totalDebt = state.debt + (state.revolving?.used ?? 0);
  return state.portfolio.length ? totalDebt / portfolioValue(state) : 0;
}
