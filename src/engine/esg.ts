/* ============================================================
   ESG & gröna lån – portföljens energiklass-snitt blir en rating
   (A–F) som påverkar lånevillkoren och uppköpstrycket.
   Ren logik, inga React-beroenden.
   ============================================================ */

import type { GameState } from "./types";

const CLASS_SCORE: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const LETTERS = ["F", "E", "D", "C", "B", "A"] as const;

export interface EsgRating {
  letter: (typeof LETTERS)[number];
  /** 0–5, snitt av portföljens energiklasser. */
  score: number;
  /** Räntejustering i procentenheter (negativt = rabatt). */
  spreadDelta: number;
}

/** Räntejustering per betyg: gröna lån för A/B, påslag för E/F. */
const SPREAD: Record<string, number> = { A: -0.5, B: -0.25, C: 0, D: 0, E: 0.3, F: 0.6 };

export function esgRatingOf(state: GameState): EsgRating {
  const klar = state.portfolio.filter((p) => p.status === "klar");
  if (klar.length === 0) return { letter: "C", score: 3, spreadDelta: 0 };
  const score =
    klar.reduce((a, p) => a + (CLASS_SCORE[p.energyClass ?? "D"] ?? 2), 0) / klar.length;
  const letter = LETTERS[Math.max(0, Math.min(5, Math.round(score)))];
  return { letter, score: +score.toFixed(2), spreadDelta: SPREAD[letter] ?? 0 };
}
