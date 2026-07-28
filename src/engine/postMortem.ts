/* ============================================================
   Obduktionen – vad som faktiskt hände med bolaget.

   Spelet ska vara svårt, och det säger ingenting under partiets gång. Men
   ett nederlag man inte förstår är inte svårt, bara godtyckligt: skillnaden
   mellan ett spel med inlärningskurva och ett som känns orättvist ligger i
   om man EFTERÅT kan se var det gick fel.

   Slutskärmen visade tid, toppkapital, hus vid slutet, skuld och rykte.
   Ingenting om att beståndet stannade på två hus sexton år före slutet –
   och det är just det som avgör partier. Mätningen över 30 partier à 50 år
   (peakLeverage.probe) gav:

     · de 22 som klarade sig:  24,3 fastigheter vid toppen, LTV 42 %
     · de 8 som föll:           2,5 fastigheter vid toppen, LTV 47 %
     · korrelation LTV ↔ fall:  r = 0,38 (svag)

   Storleken skiljer dem åt, inte belåningen. Modulen levererar spelarens
   egna tal plus den jämförelsen – och ingenting mer. Inga råd, ingen
   lösning: slutsatsen är spelarens att dra.
   ============================================================ */

import type { GameState } from "./types";

/* Riktvärden ur peakLeverage.probe (30 partier × 50 år). Räknas om när
   balansen ändras – kör sonden och uppdatera talen här. */
export const BENCHMARK_RUNS = 30;
export const BENCHMARK_SURVIVOR_PROPS = 24;
export const BENCHMARK_CASUALTY_PROPS = 2.5;
/** Gränsen där utfallen delade sig i mätningen. */
export const BENCHMARK_SAFE_PROPS = 10;

export interface PostMortem {
  /** Spelår då kapitalet toppade (1-indexerat), null om ingen topp finns. */
  peakYear: number | null;
  peakEquity: number;
  /** Beståndet och belåningen vid toppen. */
  peakProperties: number;
  peakLtv: number;
  /** Största bestånd partiet nådde, och året det nåddes. */
  largestPortfolio: number;
  largestYear: number | null;
  /** År mellan toppen och slutet. */
  yearsAfterPeak: number;
  /** Fallet från toppen, som andel (1.0 = hela kapitalet borta). */
  drawdown: number;
  /** Nådde bolaget den nivå där mätningens utfall delade sig? */
  reachedSafeSize: boolean;
}

/** Rena fakta om partiet – inga omdömen, inga råd. */
export function postMortem(state: GameState): PostMortem {
  const endAbs = state.year * 12 + state.month;
  const peak = state.peak;
  const largest = state.largestPortfolio;
  const equityNow = state.history.length ? state.history[state.history.length - 1].equity : 0;

  const peakEquity = peak?.equity ?? 0;
  const yearsAfterPeak = peak ? Math.max(0, Math.floor((endAbs - peak.monthAbs) / 12)) : 0;

  return {
    peakYear: peak ? Math.floor(peak.monthAbs / 12) : null,
    peakEquity,
    peakProperties: peak?.properties ?? 0,
    peakLtv: peak?.ltv ?? 0,
    largestPortfolio: largest?.count ?? state.portfolio.length,
    largestYear: largest ? Math.floor(largest.monthAbs / 12) : null,
    yearsAfterPeak,
    drawdown: peakEquity > 0 ? Math.max(0, 1 - equityNow / peakEquity) : 0,
    reachedSafeSize: (largest?.count ?? state.portfolio.length) >= BENCHMARK_SAFE_PROPS,
  };
}

/**
 * Jämförelseraden: hur partiet står sig mot de mätta utfallen. Formulerad
 * som ett konstaterande om andra bolag, inte som ett omdöme om spelarens.
 */
export function benchmarkLine(pm: PostMortem): string {
  return pm.reachedSafeSize
    ? `Across ${BENCHMARK_RUNS} simulated runs, companies that passed ${BENCHMARK_SAFE_PROPS} properties held an average of ${BENCHMARK_SURVIVOR_PROPS} at their peak. Yours passed that mark.`
    : `Across ${BENCHMARK_RUNS} simulated runs, the companies that lasted fifty years held an average of ${BENCHMARK_SURVIVOR_PROPS} properties at their peak. Those that did not held ${BENCHMARK_CASUALTY_PROPS.toString().replace(".", ".")}.`;
}
