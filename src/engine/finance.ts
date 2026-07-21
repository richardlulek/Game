/* ============================================================
   Finansfunktioner – lånevillkor, portföljvärde, LTV, eget kapital.
   Formlerna är oförändrade från prototypen.
   ============================================================ */

import { esgRatingOf } from "./esg";
import { creditRatingOf } from "./rating";
import { propMarketValue } from "./property";
import { spreadDelta } from "./progression";
import { stockHoldingsValue, subsidiaryValue } from "./stocks";
import { industryAssetValue } from "./industries";
import { RESTRUCTURING_EXTRA_AMORT, RESTRUCTURING_LTV_PENALTY, underRestructuringTerms } from "./receivership";
import { bankStandingTerms } from "./standing";
import { finInstitutionsValue, OWN_BANK_RATE_DELTA } from "./finInstitutions";
import type { GameState, Lender, LoanTerms } from "./types";

export const LENDERS: Lender[] = [
  {
    id: "sparbanken",
    name: "Savings Bank",
    desc: "Conservative local bank. Lower rate but tighter loan-to-value.",
    rateBonus: -0.3,
    ltvBonus: -0.05,
    minReputation: 0,
  },
  {
    id: "investmentbank",
    name: "Investment Bank",
    desc: "Aggressive financing with high loan-to-value. More expensive capital.",
    rateBonus: 0.5,
    ltvBonus: 0.08,
    minReputation: 30,
  },
  {
    id: "nordisk_kapital",
    name: "Nordic Capital",
    desc: "Nordic real-estate fund. Best rate terms but requires high reputation.",
    rateBonus: -0.6,
    ltvBonus: 0.03,
    minReputation: 70,
  },
];

/** Reputationsbaserade lånevillkor (ränta, påslag, max belåningsgrad).
 *  ESG-betyget justerar påslaget (gröna lån), och kreditbetyget (AAA–CCC)
 *  lägger sin egen spread ovanpå – hög skuld och svag räntetäckning gör
 *  varje ny krona dyrare. */
/** Skattens avskrivningsparametrar (Finans → Skatt): normal och aggressiv
 *  policy samt revisionsrisken per månad för den aggressiva. */
export const TAX_DEP_NORMAL = 0.013;
export const TAX_DEP_AGGRESSIVE = 0.02;
export const TAX_AUDIT_CHANCE = 0.01;

/** Räntebindningens löptidskurva: längre bindning = högre premie på den
 *  låsta räntan och dyrare uppläggning (banken tar betalt för ränterisken).
 *  Kort bindning är billig trygghet, lång är dyr men skyddar genom hela
 *  konjunkturcykler. */
export const RATE_LOCK_TERMS: Record<number, { premium: number; feePct: number }> = {
  12: { premium: 0, feePct: 0.003 },
  36: { premium: 0.15, feePct: 0.005 },
  60: { premium: 0.3, feePct: 0.007 },
};

export function loanTerms(state: GameState): LoanTerms {
  const rep = state.reputation;
  const advisorBonus = (state.advisors ?? []).includes("kapitalstrateg") ? 0.2 : 0;
  const esg = esgRatingOf(state).spreadDelta;
  const rating = creditRatingOf(state).spreadDelta;
  // Bankrelationen (standing) böjer både ränta och belåningsgrad.
  const bank = bankStandingTerms(state);
  // Egen bank (finInstitutions): koncernintern upplåning pressar spreaden.
  const ownBank = state.ownedBank ? OWN_BANK_RATE_DELTA : 0;
  const spread = Math.max(0.1, Math.max(0.3, 2.5 - (rep / 100) * 1.7 - spreadDelta(state) - advisorBonus) + esg + rating + bank.rateDelta + ownBank);
  const baseLtv = 0.55 + (rep / 100) * 0.19;
  const lender = LENDERS.find((l) => l.id === state.selectedLender);
  const rateAdj = lender?.rateBonus ?? 0;
  // Rekonstruktionsvillkor: nyutlåningen stryps tills villkoren löpt ut.
  const covenantLtv = underRestructuringTerms(state) ? -RESTRUCTURING_LTV_PENALTY : 0;
  const ltvAdj = (lender?.ltvBonus ?? 0) + bank.ltvDelta + covenantLtv;
  const maxLtv = Math.max(0.4, Math.min(0.85, baseLtv + ltvAdj));
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

/** Summerat marknadsvärde för industritillgångar. Avknoppade tillgångar
 *  (spinOffId) tillhör det noterade bolaget – spelarens andel av dem
 *  räknas i stället via aktieinnehavet (stockHoldingsValue). */
export function industryPortfolioValue(state: GameState): number {
  return (state.industryPortfolio ?? []).reduce(
    (a, asset) => a + (asset.spinOffId ? 0 : industryAssetValue(asset, state)),
    0,
  );
}

/** Eget kapital = tillgångar (kassa, fastigheter, mark, industri, aktier,
 *  dotterbolag) − skulder (banklån, obligationer, revolverkredit).
 *  Obligationer och revolver räknades tidigare inte som skuld, vilket lät
 *  en emission blåsa upp eget kapital med hela beloppet. */
export function equityOf(state: GameState): number {
  const bonds = (state.bonds ?? []).reduce((a, b) => a + b.amount, 0);
  const lots = state.lots.filter((l) => l.owned).reduce((a, l) => a + l.price, 0);
  return (
    state.cash +
    portfolioValue(state) +
    lots +
    industryPortfolioValue(state) +
    stockHoldingsValue(state) +
    subsidiaryValue(state) +
    finInstitutionsValue(state) -
    state.debt -
    bonds -
    (state.revolving?.used ?? 0)
  );
}

/* ── Amorteringskravets trappa ──────────────────────────────────────
   Delas av simulationen och Finans-panelen så att planeringsvyn
   alltid visar exakt det som kommer att dras. */

export interface AmortInfo {
  ltv: number;
  /** 0, 0.01 eller 0.02 – krav i andel av skulden per år. */
  yearlyPct: number;
  /** Kravet i kr per månad. */
  monthly: number;
  /** Nästa trappsteg nedåt (0.7 eller 0.5), null om amorteringsfritt. */
  nextBreakLtv: number | null;
  /** Skuld att amortera för att nå nästa trappsteg. */
  amortToNextBreak: number | null;
}

export function amortTierPct(ltv: number): number {
  return ltv > 0.7 ? 0.02 : ltv > 0.5 ? 0.01 : 0;
}

export function amortInfoOf(state: GameState): AmortInfo {
  const portVal = portfolioValue(state);
  const ltv = portVal > 0 ? state.debt / portVal : state.debt > 0 ? 1 : 0;
  // Rekonstruktionsvillkor: banken kräver +2 pp/år UTÖVER trappan, och
  // minst 2 %/år även under 50 % LTV – befintlig skuld ska betas av.
  const covenant = underRestructuringTerms(state);
  const yearlyPct = covenant
    ? Math.max(RESTRUCTURING_EXTRA_AMORT, amortTierPct(ltv) + RESTRUCTURING_EXTRA_AMORT)
    : amortTierPct(ltv);
  const monthly = Math.round((state.debt * yearlyPct) / 12);
  const nextBreakLtv = ltv > 0.7 ? 0.7 : ltv > 0.5 ? 0.5 : null;
  const amortToNextBreak =
    nextBreakLtv != null ? Math.max(0, Math.ceil(state.debt - nextBreakLtv * portVal)) : null;
  return { ltv, yearlyPct, monthly, nextBreakLtv, amortToNextBreak };
}

/** Belåningsgrad (LTV). 0 om portföljen är tom. Inkluderar revolverande kredit. */
export function ltvOf(state: GameState): number {
  const totalDebt = state.debt + (state.revolving?.used ?? 0);
  return state.portfolio.length ? totalDebt / portfolioValue(state) : 0;
}
