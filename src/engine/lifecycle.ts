/* ============================================================
   Byggnadslivscykel och budkrig – två system som bygger vidare
   på den levande ekonomin (economyLife.ts). Rivalbyggen finns
   redan i simulationen.
   Ren, testbar TypeScript utan React-beroenden.
   ============================================================ */

import { random01, rnd } from "./random";
import type { GameState, Property } from "./types";

/* ── Byggnadslivscykel ─────────────────────────────────────────────────────
   Byggnader åldras. Efter ~20 år tappar de i värde och hyra – MEN gott skick
   (löpande underhåll) håller huset modernt mycket längre, och en
   totalrenovering nollställer åldern helt (builtYear = innevarande år).
   Rivning & nybyggnation (REDEVELOP) är sista utvägen för hus som förfallit
   och blivit gamla samtidigt. */

export function buildingAge(p: Property, state: GameState): number {
  return Math.max(0, state.year - (p.builtYear ?? state.year));
}

/** Hur mycket underhållet (skicket) bromsar åldrandet: 0 vid skick ≤ 40,
 *  upp till 1 vid skick 100. Ett topputrustat hus åldras ~70 % långsammare. */
export function upkeepRelief(condition: number): number {
  return Math.max(0, Math.min(1, (condition - 40) / 60));
}

/** Obsolescensfaktor (0.7–1.0): åldrade hus tappar i attraktivitet. Löpande
 *  underhåll (högt skick) bromsar åldrandet kraftigt; en totalrenovering
 *  nollställer det helt. Börjar bita efter ~20 år på ett oskött hus. */
export function obsolescenceFactor(p: Property, state: GameState): number {
  const age = buildingAge(p, state);
  if (age < 20) return 1;
  const over = age - 20;
  // Effektiv ålder – gott skick gör att huset åldras upp till 70 % långsammare.
  const effOver = over * (1 - 0.7 * upkeepRelief(p.condition));
  return +Math.max(0.7, 1 - effOver * 0.006).toFixed(4);
}

/** Accelererat slitage för hus äldre än 40 år: stommar, stammar och tak
 *  ger sig samtidigt. +1 % slitage per år över 40, tak ×1.6. */
export function ageWearFactor(p: Property, state: GameState): number {
  const age = buildingAge(p, state);
  if (age <= 40) return 1;
  return +Math.min(1.6, 1 + (age - 40) * 0.01).toFixed(3);
}

/** Är fastigheten mogen för rivning & nybyggnation? Kräver att den är BÅDE
 *  gammal OCH att underhåll/renovering inte längre räcker – annars är
 *  totalrenovering eller underhåll den bättre vägen. */
export function isObsolete(p: Property, state: GameState): boolean {
  return buildingAge(p, state) >= 30 && obsolescenceFactor(p, state) < 0.92;
}

/* ── Budkrig ───────────────────────────────────────────────────────────────
   Budgivningar eskalerar: rivalen kan kontra spelarens motbud i upp till tre
   rundor innan de ger sig. */

/** Rivalens motbud i nästa runda – ökar 8–16 % och tröttnar efter runda 3.
 *  Aggressionen (rivalPersonas, 0–1) skalar vikbenägenheten: Harborwick
 *  (0.9) viker hälften så ofta som snittet, Sonny Lund (0.3) tröttnar fort. */
export function nextBidRound(
  amount: number,
  round: number,
  aggression = 0.5,
): { amount: number; fold: boolean } {
  if (round >= 3) return { amount, fold: true };
  const base = round === 1 ? 0.25 : round === 2 ? 0.5 : 0.8;
  const foldChance = Math.min(0.95, base * (1.4 - aggression * 0.9));
  if (random01() < foldChance) return { amount, fold: true };
  return { amount: Math.round(amount * rnd(1.08, 1.16)), fold: false };
}
