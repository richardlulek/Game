/* ============================================================
   Riksbanken 2.0 (Masterplan fas 1) – inflationsmodell och
   Taylor-regel.

   Tidigare var styrräntan en enkel funktion av cykelfasen
   (policyRateTarget) och flyttades dessutom direkt av händelser
   och refinansieringar. Nu:

   · INFLATIONEN modelleras månadsvis ur stadens verkliga läge:
     marknadsöverhettning (marketMod mot ankaret), byggkostnads-
     tryck, befolkningstillväxt, cykelfas och chockimpulser från
     händelser (energipriser m.m.). EMA-utjämnad så den rör sig
     trögt och läsbart.
   · RIKSBANKEN sätter styrräntan kvartalsvis mot ett Taylor-mål:
     neutral ränta + 1,5 × (inflation − mål) + konjunkturgap.
     Max 50 punkter per besked, i 25-punkterssteg.
   · REFINANSIERINGAR rör inte längre styrräntan (det var en
     kvarleva som blandade ihop bas och spread) – de sätter i
     stället en personlig refi-premie (refiSpreadAdj) som
     loanTerms läser.

   Ren logik, inga React-beroenden.
   ============================================================ */

import { cityPopulation } from "./population";
import type { GameState, LogEntry } from "./types";

export const INFLATION_TARGET = 2.0;
export const NEUTRAL_RATE = 3.25;
/** Max rörelse per räntebesked (två 25-punkterssteg). */
export const RATE_DECISION_MAX = 0.5;
export const RATE_MIN = 0.25;
export const RATE_MAX = 10;
/** Chockimpulsernas halveringstakt per månad. */
export const IMPULSE_DECAY = 0.85;
/** EMA-vikt för månadens råinflation. */
const INFLATION_EMA = 0.15;

export interface CentralBankState {
  /** Årlig inflation i %, EMA-utjämnad. */
  inflation: number;
  /** Chock-term från händelser (klingar av med IMPULSE_DECAY). */
  impulse: number;
  /** Föregående månads stadsbefolkning (för tillväxttermen). */
  popPrev?: number;
  /** Kurvan var inverterad förra månaden (för engångsvarningen). */
  inverted?: boolean;
}

export function centralBankOf(s: GameState): CentralBankState {
  return s.centralBank ?? { inflation: INFLATION_TARGET, impulse: 0 };
}

/** Månadens råinflation ur stadens läge + vilka krafter som driver den.
 *  Kalibrering (efter 30-årsmätningar): termerna mäter AVVIKELSER från
 *  stadens normalläge med symmetriska tak. Den gamla kalibreringen lät
 *  bygg- och befolkningstermerna bara dra uppåt (all tillväxt räknades
 *  som överhettning, ×40 med tak +2) – i ett aktivt parti fastnade
 *  inflationen på 5–7 % och styrräntan därmed på 7–10 %. */
export function inflationDrivers(s: GameState): { raw: number; drivers: string[] } {
  const cb = centralBankOf(s);
  const drivers: string[] = [];
  // Marknadsöverhettning: priser över trendankaret eldar på inflationen.
  const gap = s.marketMod / Math.max(0.5, s.marketModAnchor ?? 1) - 1;
  const heat = Math.max(-1.5, Math.min(1.5, gap * 8));
  if (Math.abs(heat) > 0.3) drivers.push(gap > 0 ? "hot property market" : "falling property prices");
  // Byggkostnadstryck (råvaror) – impulsartat: spikar klingar av mot 1.
  const build = Math.max(-0.5, Math.min(1.2, ((s.buildCostMod ?? 1) - 1) * 3));
  if (build > 0.3) drivers.push("construction cost pressure");
  // Befolkningstillväxt UTÖVER trend (~1,5 %/år är stadens normala takt
  // och ska inte ge räntehöjningar – bara verklig överhettning gör det).
  const pop = cityPopulation(s);
  const popGrowth = cb.popPrev && cb.popPrev > 0 ? (pop - cb.popPrev) / cb.popPrev : 0;
  const demo = Math.max(-0.6, Math.min(1.0, (popGrowth * 12 - 0.015) * 25));
  if (demo > 0.4) drivers.push("population inflow");
  // Konjunkturfas och kris.
  const phase = s.marketCycle?.phase ?? "stable";
  const cyc = phase === "boom" ? 0.8 : phase === "bust" ? -1.2 : 0;
  if (phase !== "stable") drivers.push(phase === "boom" ? "boom demand" : "downturn slack");
  const crisis = (s.crisisMonthsLeft ?? 0) > 0 ? -2.0 : 0;
  if (crisis) drivers.push("crisis demand collapse");
  if (Math.abs(cb.impulse) > 0.3) drivers.push(cb.impulse > 0 ? "price shocks" : "disinflation shock");

  const raw = INFLATION_TARGET + heat + build + demo + cyc + crisis + cb.impulse;
  return { raw, drivers };
}

/** Månadstick: uppdatera inflations-EMA och låt impulser klinga av.
 *  Muterar s.centralBank (simulationen äger kopian). */
export function tickInflation(s: GameState): void {
  const cb = centralBankOf(s);
  const { raw } = inflationDrivers(s);
  const inflation = +(cb.inflation + (raw - cb.inflation) * INFLATION_EMA).toFixed(2);
  s.centralBank = {
    inflation,
    impulse: +(cb.impulse * IMPULSE_DECAY).toFixed(2),
    popPrev: cityPopulation(s),
  };
}

/** Taylor-målet: neutral + 1,5 × inflationsgap + konjunkturgap. */
export function taylorTarget(inflation: number, phase: "boom" | "bust" | "stable"): number {
  const outputGap = phase === "boom" ? 0.5 : phase === "bust" ? -1.0 : 0;
  const target = NEUTRAL_RATE + 1.5 * (inflation - INFLATION_TARGET) + outputGap;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, target));
}

/* ── Avkastningskurvan ──────────────────────────────────────────────
   Kort ände = styrräntan (certifikaten prissätts där). Lång ände =
   marknadens förväntade styrränteBANA (snittet av dagens ränta och
   Taylor-målet) plus en löptidspremie – obligationerna prissätts där.
   Inverterad kurva (styrräntan över långräntan) betyder att marknaden
   prisar in sänkningar: den klassiska recessionssignalen. */

export const TERM_PREMIUM = 0.8;

/** Lång marknadsränta (≈10 år). */
export function longRate(s: GameState): number {
  const cb = centralBankOf(s);
  const phase = s.marketCycle?.phase ?? "stable";
  const expectedPath = (s.interestRate + taylorTarget(cb.inflation, phase)) / 2;
  return +Math.max(RATE_MIN, expectedPath + TERM_PREMIUM).toFixed(2);
}

/** Är kurvan inverterad (recessionssignal)? */
export function curveInverted(s: GameState): boolean {
  return s.interestRate > longRate(s) + 0.1;
}

/** Kvartalsvis räntebesked: styrräntan söker sig mot Taylor-målet i
 *  25-punkterssteg, max 50 punkter per besked. Returnerar händelser. */
export function centralBankDecision(s: GameState): LogEntry[] {
  const cb = centralBankOf(s);
  const phase = s.marketCycle?.phase ?? "stable";
  const target = taylorTarget(cb.inflation, phase);
  const diff = target - s.interestRate;
  const step = Math.sign(diff) * Math.min(RATE_DECISION_MAX, Math.round(Math.abs(diff) / 0.25) * 0.25);
  if (Math.abs(step) < 0.25) {
    return [{
      t: `🏛️ The central bank holds the policy rate at ${s.interestRate.toFixed(2)}% (inflation ${cb.inflation.toFixed(1)}%, target ${INFLATION_TARGET.toFixed(1)}%).`,
      kind: "info",
    }];
  }
  s.interestRate = +(Math.max(RATE_MIN, Math.min(RATE_MAX, s.interestRate + step)).toFixed(2));
  const { drivers } = inflationDrivers(s);
  const why = drivers.length > 0 ? ` Drivers: ${drivers.slice(0, 3).join(", ")}.` : "";
  return [{
    t: `🏛️ The central bank ${step > 0 ? "RAISES" : "CUTS"} the policy rate ${Math.abs(step) >= 0.5 ? "50" : "25"} bps to ${s.interestRate.toFixed(2)}% — inflation ${cb.inflation.toFixed(1)}% vs the ${INFLATION_TARGET.toFixed(1)}% target.${why}`,
    kind: step > 0 ? "warn" : "income",
  }];
}
