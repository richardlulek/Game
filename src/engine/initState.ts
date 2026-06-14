/* ============================================================
   Initialt speltillstånd.
   ============================================================ */

import { AI_NAMES } from "./data";
import { genListing, genLot } from "./generators";
import { rnd } from "./random";
import type { GameState } from "./types";

/** Skapar ett nytt speltillstånd med startobjekt, tomter och konkurrenter. */
export function initState(): GameState {
  const base: GameState = {
    month: 1,
    year: 1,
    cash: 5_000_000,
    debt: 0,
    interestRate: 2.5,
    marketMod: 1.0,
    demandMod: 1.0,
    taxMod: 1.0,
    reputation: 50,
    portfolio: [],
    listings: [],
    lots: [],
    competitors: [],
    log: [{ t: "Du startar med 5 MSEK eget kapital. Lycka till!", kind: "info" }],
    history: [{ month: 0, equity: 5_000_000 }],
    gameOver: false,
  };
  for (let i = 0; i < 6; i++) base.listings.push(genListing(base));
  for (let i = 0; i < 3; i++) base.lots.push(genLot(base));
  AI_NAMES.forEach((n) =>
    base.competitors.push({
      name: n,
      cash: rnd(3, 8) * 1e6,
      units: Math.round(rnd(2, 5)),
      equity: rnd(8, 20) * 1e6,
    }),
  );
  return base;
}
