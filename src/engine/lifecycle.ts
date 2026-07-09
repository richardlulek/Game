/* ============================================================
   Byggnadslivscykel och budkrig – två system som bygger vidare
   på den levande ekonomin (economyLife.ts). Rivalbyggen finns
   redan i simulationen.
   Ren, testbar TypeScript utan React-beroenden.
   ============================================================ */

import { rnd } from "./random";
import type { GameState, Property } from "./types";

/* ── Byggnadslivscykel ─────────────────────────────────────────────────────
   Byggnader åldras. Efter ~20 år tappar de i värde och hyra – snabbare om
   skicket är eftersatt – tills de rivs och ersätts (REDEVELOP → nybyggnation). */

export function buildingAge(p: Property, state: GameState): number {
  return Math.max(0, state.year - (p.builtYear ?? state.year));
}

/** Obsolescensfaktor (0.7–1.0): åldrade hus tappar i attraktivitet – snabbare
 *  om skicket är eftersatt. Börjar bita efter ~20 år. */
export function obsolescenceFactor(p: Property, state: GameState): number {
  const age = buildingAge(p, state);
  if (age < 20) return 1;
  const over = age - 20;
  const perYear = p.condition < 50 ? 0.006 : 0.003;
  return +Math.max(0.7, 1 - over * perYear).toFixed(4);
}

/** Är fastigheten mogen för rivning & nybyggnation? */
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
