/* ============================================================
   Rivalernas balansräkningar (Masterplan fas 3, batch 1).

   Rivalerna har haft kassa och hus men ingen skuldsida – räntan
   bet aldrig på dem, och "retention" fick abstrahera bort både
   räntor och utdelningar. Nu:

   · SKULD: köp och byggen finansieras med belåning (strategi-
     beroende belåningsgrad). Skulden ligger kvar på boken och
     kostar ränta varje månad – marknadsräntan + en spread som
     beror på storlek och strategi.
   · RÄNTEKÄNSLIGHET: när riksbanken höjer stiger rivalernas
     räntekostnad direkt. Räntetäckningsgraden (NOI/ränta) är
     rivalens hälsomått – under 1.0 i tre månader ⇒ nödförsäljning
     och skuldnedbetalning, precis som spelarens covenanter.
   · AMORTERING: överskottskassa amorterar (utdelningsbolag mest,
     tillväxtbolag minst – de rullar hellre vidare).
   · EGET KAPITAL netto: equity = tillgångar − skuld.

   Ren logik, inga React-beroenden.
   ============================================================ */

import type { Competitor, GameState } from "./types";

/** Belåningsgrad vid köp/byggen per strategi. */
export function rivalLeverage(c: Competitor): number {
  if (c.institutional) return 0.3; // fonder köper mest med eget kapital
  switch (c.strategy) {
    case "tillväxt": return 0.65;
    case "utdelning": return 0.5;
    case "värde": return 0.45;
    case "distrikt": return 0.55;
    default: return 0.55;
  }
}

/** Räntespread över marknadsräntan: små och högbelånade betalar mer. */
export function rivalRateSpread(c: Competitor): number {
  const sizeSpread = c.equity > 300_000_000 ? 0.4 : c.equity > 100_000_000 ? 0.7 : 1.1;
  const stratSpread = c.strategy === "tillväxt" ? 0.4 : 0;
  return +(sizeSpread + stratSpread).toFixed(2);
}

/** Månatlig räntekostnad på rivalens skuld. */
export function rivalInterest(s: GameState, c: Competitor): number {
  const debt = c.debt ?? 0;
  if (debt <= 0) return 0;
  return Math.round((debt * (s.interestRate + rivalRateSpread(c))) / 100 / 12);
}

/** Räntetäckningsgrad: NOI / räntekostnad. Utan skuld är den oändlig. */
export function rivalICR(s: GameState, c: Competitor): number {
  const interest = rivalInterest(s, c);
  if (interest <= 0) return Infinity;
  return +((c.monthlyNOI ?? 0) / interest).toFixed(2);
}

/** Så många månader i följd med ICR < 1 tvingar fram en nödförsäljning. */
export const RIVAL_ICR_GRACE_MONTHS = 3;

/** Andel av överskottskassan (över bufferten) som amorteras per månad. */
export function rivalAmortShare(c: Competitor): number {
  switch (c.strategy) {
    case "utdelning": return 0.15;
    case "värde": return 0.10;
    case "tillväxt": return 0.03;
    default: return 0.06;
  }
}

/** Kassabuffert som aldrig amorteras bort. */
export const RIVAL_CASH_BUFFER = 5_000_000;

/** Finansiera ett köp/bygge: kassan betalar eget kapitaldelen, resten blir
 *  skuld på boken. Muterar rivalen (används i simulationens rivalblock). */
export function rivalFinancePurchase(c: Competitor, price: number): void {
  const lev = rivalLeverage(c);
  const debtPart = Math.round(price * lev);
  c.debt = (c.debt ?? 0) + debtPart;
  c.cash = Math.round(c.cash - (price - debtPart));
}

/** Nödförsäljningens intäkter: skulden betalas ned först (70 % av köpe-
 *  skillingen öronmärks), resten stärker kassan. Returnerar ny (debt, cash). */
export function applyDistressProceeds(c: Competitor, price: number): { debt: number; cash: number } {
  const toDebt = Math.min(c.debt ?? 0, Math.round(price * 0.7));
  return { debt: (c.debt ?? 0) - toDebt, cash: Math.round(c.cash + price - toDebt) };
}
