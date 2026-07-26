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
/** Covenant-lånet: räntelättnad mot räntetäckningskrav (Finans → Lån). */
export const COVENANT_RATE_DELTA = 0.25;
export const COVENANT_ICR_FLOOR = 1.3;
export const COVENANT_ICR_SIGNUP = 1.8;
export const COVENANT_BREACH_MONTHS = 3;

/** Företagscertifikat (Finans → Kapitalmarknad): kort marknadsfinansiering.
 *  Billigare än obligationer men rullas var 12:e månad – i kris kan
 *  marknaden frysa och tvinga fram en dyr bankbrygga. */
export const CP_SPREAD = 0.6;
export const CP_MAX_OF_EQUITY = 0.15;
export const CP_TERM_MONTHS = 12;

/** Koncernintern upplåning via egen bank: extra räntelättnad – men
 *  bankens externa utlåningsvolym (och intjäning) krymper lika mycket. */
export const INTERNAL_FUNDING_RATE_DELTA = 0.2;
export const INTERNAL_FUNDING_SHARE = 0.25;

/** Investerarrelationer: månadskostnad (minst 100 000). */
export const IR_COST_MIN = 100_000;
export const IR_COST_OF_EQUITY = 0.00002;

/** Rivalobligationer: kupongbas över styrräntan + riskpremie efter
 *  rivalens storlek; 3-årig löptid. */
export const RIVAL_BOND_TERM = 36;
export const RIVAL_BOND_MAX_OF_RIVAL_EQ = 0.1;

/** Konvertibler: kupongrabatt mot utspädningsrisk (kräver börsnotering). */
export const CONVERTIBLE_RATE_DISCOUNT = 1.0;
export const CONVERTIBLE_TRIGGER = 1.3;
export const CONVERTIBLE_MAX_OF_EQUITY = 0.1;
export const CONVERTIBLE_TERM = 60;

/** Ränteavdragstak: räntor är avdragsgilla upp till 50 % av driftnettot –
 *  extrembelåning förlorar skatteskölden (knyter Lån till Skatt). */
export const INTEREST_CAP_OF_NOI = 0.5;

/** Periodiseringsfonder (Finans → Skatt): uppskjuten skatt. */
export const TAX_RESERVE_MAX_PCT = 0.25;
export const TAX_RESERVE_TERM = 72;
export const TAX_RESERVE_MAX_COUNT = 6;
/** Holdingstruktur (nivå 5): permanent skattesänkning. */
export const HOLDING_TAX_DELTA = 0.02;

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
  // Covenant-lånet köper räntelättnad mot ett räntetäckningskrav.
  const covenant = state.loanCovenant ? -COVENANT_RATE_DELTA : 0;
  // Koncernintern upplåning: egen bank som motpart pressar spreaden mer.
  const internal = state.ownedBank?.internalFunding ? -INTERNAL_FUNDING_RATE_DELTA : 0;
  // Refinansieringspremien: marknadsläget vid senaste låneförfallet
  // (simulation.ts) präglar villkoren tills nästa förfall.
  const refi = state.refiSpreadAdj ?? 0;
  const spread = Math.max(0.1, Math.max(0.3, 2.5 - (rep / 100) * 1.7 - spreadDelta(state) - advisorBonus) + esg + rating + bank.rateDelta + ownBank + covenant + internal + refi);
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

/**
 * Belåningsgrad som bolaget faktiskt kör på – vid förvärv (köp, auktion,
 * bygge, affär med rival) OCH vid refinansiering. Banken sätter taket;
 * policyn kan välja att ligga under.
 *
 * Tidigare lånade både förvärv och refinansiering maximalt – hävstången var
 * en regel, inte ett val. Eftersom refinansiering är det enda sättet att
 * frigöra kapital ur beståndet låste det ute varje strategi som medvetet
 * ville ligga lägre: de kunde köpa försiktigt, men aldrig växa.
 */
export function acquisitionLtv(state: GameState): number {
  const { maxLtv } = loanTerms(state);
  const target = state.policy?.purchaseLtv;
  if (target === undefined) return maxLtv;
  return Math.max(0, Math.min(maxLtv, target));
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
    (state.rivalBonds ?? []).reduce((a, b) => a + b.amount, 0) -
    state.debt -
    bonds -
    (state.commercialPaper?.amount ?? 0) -
    (state.convertibles ?? []).reduce((a, c) => a + c.amount, 0) -
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
