/* Uppstickarna: små, onoterade lokalbolag med 2–3 hus och hög belåning.
   De föds med partiet, skalar med rivalinställningen, hålls utanför
   börsen – och nya kan kliva in mitt i partiet när aktörsfältet glesnat. */

import { describe, expect, it } from "vitest";
import { SMALL_AI_NAMES } from "../engine/data";
import { initState } from "../engine/initState";
import { aggressionOf, personaFor } from "../engine/rivalPersonas";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("STARTFÄLTET: sju stora och fyra små", () => {
  it("initState skapar uppstickare med små, högbelånade böcker", () => {
    const s = initState();
    const small = s.competitors.filter((c) => c.small);
    const large = s.competitors.filter((c) => !c.small);
    expect(large).toHaveLength(7);
    expect(small).toHaveLength(4);
    for (const c of small) {
      expect(c.portfolio.length).toBeGreaterThanOrEqual(2);
      expect(c.portfolio.length).toBeLessThanOrEqual(3);
      const portVal = c.portfolio.reduce((a, p) => a + p.askPrice, 0);
      expect(c.debt).toBe(Math.round(portVal * 0.55));
      expect(c.cash).toBeLessThan(3_000_000);
    }
  });

  it("uppstickarna är onoterade – bara de stora har aktier", () => {
    const s = initState();
    const listed = new Set(s.stocks.map((st) => st.competitorName).filter(Boolean));
    for (const n of SMALL_AI_NAMES) expect(listed.has(n)).toBe(false);
    expect(listed.has("Northgate Properties")).toBe(true);
  });

  it("rivalinställningen skalar även uppstickarna", () => {
    const s = initState({ rivalCount: 4 });
    expect(s.competitors.filter((c) => !c.small)).toHaveLength(4);
    expect(s.competitors.filter((c) => c.small)).toHaveLength(2);
  });

  it("alla uppstickare har personor med aggression", () => {
    for (const n of SMALL_AI_NAMES) {
      expect(personaFor(n)).toBeDefined();
      expect(aggressionOf(n)).toBeGreaterThan(0);
    }
    expect(aggressionOf("Ladder Capital")).toBe(0.85);
    expect(aggressionOf("Old Town Trust")).toBe(0.2);
  });
});

describe("MIDGAME-INTRÄDE: staden får påfyllnad av utmanare", () => {
  it("ett nytt småbolag kliver in med såddkapital när fältet glesnat", () => {
    seedRng(73);
    try {
      const large = (name: string): Competitor => ({
        name,
        cash: 30_000_000,
        units: 0,
        equity: 150_000_000,
        portfolio: [],
        strategy: "värde",
      });
      let s = makeState({
        competitors: ["Northgate Properties", "Wellspring Invest", "Coastline Ltd", "City Core Group"].map(large),
      });
      let entered = false;
      for (let m = 0; m < 600 && !entered; m++) {
        s = tick(s);
        entered = s.log.some((e) => e.t.includes("NEW PLAYER"));
      }
      expect(entered).toBe(true);
      const newcomer = s.competitors.find((c) => c.small);
      expect(newcomer).toBeDefined();
      expect(SMALL_AI_NAMES).toContain(newcomer!.name);
      expect(newcomer!.cash).toBeGreaterThan(0);
    } finally {
      clearRng();
    }
  }, 120_000);
});
