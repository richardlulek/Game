/* ============================================================
   Byggnadslivscykel och budkrig – två system som bygger vidare
   på den levande ekonomin (economyLife.ts). Rivalbyggen finns
   redan i simulationen.
   Ren, testbar TypeScript utan React-beroenden.
   ============================================================ */

import { rnd } from "./random";
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

/** Är fastigheten mogen för rivning & nybyggnation? Kräver att den är BÅDE
 *  gammal OCH att underhåll/renovering inte längre räcker – annars är
 *  totalrenovering eller underhåll den bättre vägen. */
export function isObsolete(p: Property, state: GameState): boolean {
  return buildingAge(p, state) >= 30 && obsolescenceFactor(p, state) < 0.92;
}

/* ── Budkrig ───────────────────────────────────────────────────────────────
   Budgivningar eskalerar: rivalen kan kontra spelarens motbud i upp till tre
   rundor innan de ger sig. */

/** Rivalens motbud i nästa runda – ökar 8–16 % och tröttnar efter runda 3. */
export function nextBidRound(amount: number, round: number): { amount: number; fold: boolean } {
  if (round >= 3) return { amount, fold: true };
  const foldChance = round === 1 ? 0.25 : round === 2 ? 0.5 : 0.8;
  if (Math.random() < foldChance) return { amount, fold: true };
  return { amount: Math.round(amount * rnd(1.08, 1.16)), fold: false };
}
