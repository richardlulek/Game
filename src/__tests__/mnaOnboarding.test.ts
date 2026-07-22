/* M&A-onboarding: rådgivarens tre engångsbrev lär ut systemet vid rätt
   ögonblick – introduktionen, budpliktsvarningen och integrationsprimern. */

import { describe, expect, it } from "vitest";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState, Stock } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const rival: Competitor = {
  name: "Wellspring Invest", cash: 10_000_000, units: 0, equity: 80_000_000,
  portfolio: [makeProperty({ id: 6600, owned: false })], strategy: "värde",
};

describe("RÅDGIVARBREVEN: onboarding vid rätt ögonblick", () => {
  it("introduktionen kommer vid 25M equity och kan anlita rådgivarna", () => {
    seedRng(151);
    try {
      let s = makeState({ cash: 30_000_000, competitors: [rival] });
      s = tick(s);
      expect(s.pendingDecision?.id).toBe("mna-intro");
      expect(s.mnaIntroSeen).toContain("intro");
      s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
      expect(s.maAdvisor).toBe(true);
      // Engångs: brevet återkommer inte.
      s = tick(s);
      expect(s.pendingDecision?.id).not.toBe("mna-intro");
    } finally {
      clearRng();
    }
  });

  it("fattig spelare får inget brev", () => {
    seedRng(151);
    try {
      const s = tick(makeState({ cash: 3_000_000, competitors: [rival] }));
      expect(s.pendingDecision?.id).not.toBe("mna-intro");
    } finally {
      clearRng();
    }
  });

  it("budpliktsvarningen kommer vid första 10 %-posten", () => {
    seedRng(157);
    try {
      const st = {
        id: "c0", name: "Wellspring Invest", sector: "fastighet", price: 100, prevPrice: 100,
        sharesOutstanding: 1000, owned: 120, avgCost: 100, dividendYield: 0.03, beta: 1,
        drift: 0, volatility: 0.02, history: [100], competitorName: "Wellspring Invest",
      } as Stock;
      let s = makeState({ cash: 5_000_000, competitors: [rival], stocks: [st], mnaIntroSeen: ["intro"] });
      s = tick(s);
      expect(s.pendingDecision?.id).toBe("mna-toehold");
      expect(s.mnaIntroSeen).toContain("toehold");
    } finally {
      clearRng();
    }
  });

  it("integrationsprimern kommer efter första förvärvet", () => {
    seedRng(163);
    try {
      let s = makeState({
        cash: 5_000_000,
        mnaIntroSeen: ["intro", "toehold"],
        integrations: [{ target: "Old Town Trust", startAbs: 13, months: 9, synergyGoal: 5_000_000, hostile: false, propertyIds: [] }],
      });
      s = tick(s);
      expect(s.pendingDecision?.id).toBe("mna-integration");
    } finally {
      clearRng();
    }
  });
});
