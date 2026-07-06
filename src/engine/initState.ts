/* ============================================================
   Initialt speltillstånd.
   ============================================================ */

import { AI_NAMES, START_DISTRICTS } from "./data";
import { genListing, genLot, genRivalHolding } from "./generators";
import { rnd } from "./random";
import type { GameState, RivalHolding } from "./types";

/** Skapar ett nytt speltillstånd med startobjekt, tomter och konkurrenter. */
export function initState(): GameState {
  const base: GameState = {
    month: 1,
    year: 1,
    cash: 5_000_000,
    debt: 0,
    interestRate: 4.0,
    marketMod: 1.0,
    demandMod: 1.0,
    taxMod: 1.0,
    reputation: 50,
    portfolio: [],
    listings: [],
    lots: [],
    competitors: [],
    unlockedDistricts: [...START_DISTRICTS],
    log: [{ t: "Du startar med 5 MSEK eget kapital. Lycka till!", kind: "info" }],
    history: [{ month: 0, equity: 5_000_000 }],
    gameOver: false,
  };
  // Delat occupied-set så att startobjekten inte hamnar på samma tomtruta.
  const occupied = new Set<string>();
  for (let i = 0; i < 6; i++) base.listings.push(genListing(base, occupied));
  for (let i = 0; i < 3; i++) base.lots.push(genLot(base, occupied));
  AI_NAMES.forEach((n) => {
    const holdings: RivalHolding[] = [];
    const units = Math.round(rnd(2, 5));
    for (let i = 0; i < units; i++)
      holdings.push(genRivalHolding(base.unlockedDistricts, occupied));
    base.competitors.push({
      name: n,
      cash: rnd(3, 8) * 1e6,
      units: holdings.length,
      equity: rnd(8, 20) * 1e6,
      holdings,
    });
  });
  return base;
}
