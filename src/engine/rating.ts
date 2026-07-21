/* ============================================================
   Kreditbetyg – ratinginstitutet ser på koncernen som en bank:
   belåningsgrad, räntetäckning, storlek, ESG och kris väger ihop
   till AAA–CCC. Betyget styr lånespread och hur stort obligations-
   program marknaden accepterar. Ren logik utan React-beroenden.
   ============================================================ */

import { longRate } from "./centralBank";
import { esgRatingOf } from "./esg";
import { equityOf, industryPortfolioValue, portfolioValue } from "./finance";
import { propNOI } from "./property";
import type { GameState } from "./types";

export type CreditRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

export interface RatingInfo {
  rating: CreditRating;
  /** 0–100, det sammanvägda kreditbetygspoänget. */
  score: number;
  /** Räntejustering i procentenheter från betyget (utöver ESG/rykte). */
  spreadDelta: number;
  /** Största totala obligationsprogram marknaden tecknar (kr). */
  bondCap: number;
  /** Belåningsgrad som betyget såg (för UI och covenantvarningar). */
  ltv: number;
  /** Räntetäckningsgrad NOI/ränta (för UI och covenantvarningar). */
  icr: number;
  /** Läsbar sammanfattning av vad som driver betyget. */
  drivers: string[];
}

const RATING_SPREAD: Record<CreditRating, number> = {
  AAA: -0.6, AA: -0.4, A: -0.2, BBB: 0, BB: 0.5, B: 1.2, CCC: 2.5,
};
/** Obligationstak som andel av eget kapital per betyg. */
const BOND_CAP_PCT: Record<CreditRating, number> = {
  AAA: 0.6, AA: 0.5, A: 0.4, BBB: 0.3, BB: 0.2, B: 0.1, CCC: 0,
};

/** Total räntebärande skuld (banklån + obligationer + revolver). */
export function totalDebtOf(s: GameState): number {
  const bonds = (s.bonds ?? []).reduce((a, b) => a + b.amount, 0);
  return s.debt + bonds + (s.revolving?.used ?? 0);
}

export function creditRatingOf(s: GameState): RatingInfo {
  const assets =
    portfolioValue(s) + industryPortfolioValue(s) +
    s.lots.filter((l) => l.owned).reduce((a, l) => a + l.price, 0) + s.cash;
  const debt = totalDebtOf(s);
  const ltv = assets > 0 ? debt / assets : 0;
  const annualNOI = s.portfolio.reduce((a, p) => a + propNOI(p, s), 0);
  const annualInterest = debt * (s.interestRate / 100);
  const icr = annualInterest > 1 ? annualNOI / annualInterest : 99;

  const drivers: string[] = [];
  // Belåningsgrad: ≤30 % ger full pott, ≥80 % ger noll.
  const ltvScore = Math.max(0, Math.min(40, 40 * (0.8 - ltv) / 0.5));
  drivers.push(`Loan-to-value ${(ltv * 100).toFixed(0)}%`);
  // Räntetäckning: ICR ≥ 4 ger full pott.
  const icrScore = Math.max(0, Math.min(30, (icr / 4) * 30));
  drivers.push(`Interest coverage ${icr >= 99 ? "∞" : icr.toFixed(1)}×`);
  // Storlek: större balansräkning tål mer (log-skala upp till 20 p).
  const eq = Math.max(1, equityOf(s));
  const sizeScore = Math.max(0, Math.min(20, (Math.log10(eq) - 6.5) * 8));
  // ESG: gröna koncerner lånar billigare även hos ratinginstitutet.
  const esgLetter = esgRatingOf(s).letter;
  const esgScore = esgLetter === "A" ? 10 : esgLetter === "B" ? 5 : esgLetter === "E" || esgLetter === "F" ? -5 : 0;
  if (esgScore !== 0) drivers.push(`ESG ${esgLetter}`);
  // Kris: fryst kapitalmarknad sänker alla.
  const crisis = (s.crisisMonthsLeft ?? 0) > 0 ? -10 : 0;
  if (crisis) drivers.push("Fastighetskris");
  // Investerarrelationer: transparens och roadshows betalar sig i betyget.
  const ir = s.irProgram ? IR_RATING_BONUS : 0;
  if (ir) drivers.push("Investor relations");

  // Små bolag saknar institutionell historik: under 50 Msek eget kapital
  // toppar betyget på BBB – ratingresan är en del av bolagsresan.
  const sizeCap = eq < 50_000_000 ? 55 : 100;
  const score = Math.max(0, Math.min(sizeCap, ltvScore + icrScore + sizeScore + esgScore + crisis + ir));
  const rating: CreditRating =
    score >= 85 ? "AAA" : score >= 72 ? "AA" : score >= 60 ? "A" :
    score >= 48 ? "BBB" : score >= 36 ? "BB" : score >= 24 ? "B" : "CCC";

  return {
    rating,
    score: Math.round(score),
    spreadDelta: RATING_SPREAD[rating],
    bondCap: Math.round(BOND_CAP_PCT[rating] * Math.max(0, equityOf(s))),
    ltv,
    icr: Math.min(99, icr),
    drivers,
  };
}

/** Obligationsränta för ett betyg: basränta + programpåslag. */
/** Kupongrabatt för gröna obligationer (kräver ESG-betyg A/B). */
export const GREEN_BOND_DISCOUNT = 0.35;

/** Investerarrelationer (Finans → Kapitalmarknad): +ratingpoäng mot
 *  en löpande månadskostnad. */
export const IR_RATING_BONUS = 8;

export function bondRateFor(s: GameState, rating: CreditRating): number {
  const spread: Record<CreditRating, number> = {
    AAA: 0.6, AA: 0.8, A: 1.0, BBB: 1.4, BB: 2.2, B: 3.2, CCC: 5,
  };
  // Obligationer prissätts i kurvans LÅNGA ände (centralBank.longRate):
  // väntas styrräntan falla blir lång upplåning billigare än kort – och
  // tvärtom. Certifikaten (CP_SPREAD) bor kvar i korta änden.
  return +Math.max(3.0, longRate(s) + spread[rating]).toFixed(2);
}

/** Covenantkontroll: bryts när skulden springer före intjäningen.
 *  Returnerar en varningstext eller null. */
export function covenantBreach(info: RatingInfo): string | null {
  if (info.ltv > 0.75 && info.icr < 1.5)
    return `Loan-to-value ${(info.ltv * 100).toFixed(0)}% and interest coverage ${info.icr.toFixed(1)}× breach the loan covenants`;
  if (info.ltv > 0.8) return `Loan-to-value ${(info.ltv * 100).toFixed(0)}% breaches the loan covenants`;
  if (info.icr < 1.1) return `Interest coverage ${info.icr.toFixed(1)}× breaches the loan covenants`;
  return null;
}
