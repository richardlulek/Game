/* ============================================================
   Slump- och id-hjälpare.
   Math.random() behålls medvetet (samma beteende som prototypen).
   ============================================================ */

import type { GameState } from "./types";

/** Slumptal i intervallet [a, b). */
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Slumpar ett element ur en array. */
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

let _id = 1;

/** Genererar ett nytt unikt id. */
export const newId = (): number => _id++;

/**
 * Synkar id-räknaren efter att ett sparat tillstånd laddats, så att nya id:n
 * inte krockar med redan existerande. Behövs för persistens mellan sessioner
 * (id-räknaren nollställs vid sidladdning).
 */
export function syncIdCounter(state: GameState): void {
  let max = 0;
  const consider = (n: number | undefined): void => {
    if (typeof n === "number" && n > max) max = n;
  };
  state.portfolio?.forEach((p) => {
    consider(p.id);
    consider(p.tenant?.id);
  });
  state.listings?.forEach((p) => {
    consider(p.id);
    consider(p.tenant?.id);
  });
  state.lots?.forEach((l) => consider(l.id));
  _id = max + 1;
}

/** Endast för test: nollställer id-räknaren. */
export function _resetIdCounter(start = 1): void {
  _id = start;
}
