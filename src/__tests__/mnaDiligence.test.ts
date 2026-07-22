/* M&A 2.0 batch 2: underrättelser & due diligence. DD kostar och tar tid
   men ger exakta böcker och skyddar mot lik i garderoben; rådgivararvodet
   dras månadsvis. */

import { describe, expect, it } from "vitest";
import { MA_ADVISOR_FEE, SKELETON_RISK, ddCostFor, ddDoneFor, executeAcquisition } from "../engine/mna";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return {
    name,
    cash: 5_000_000,
    units: 0,
    equity: 60_000_000,
    portfolio: Array.from({ length: 6 }, (_, i) =>
      makeProperty({ id: 7800 + i, owned: false, askPrice: 15_000_000, condition: 80 }),
    ),
    strategy: "värde",
    ...over,
  };
}

describe("DUE DILIGENCE: kostnad, tid och exakta böcker", () => {
  it("startas mot avgift, blir klar efter två månader och flaggar bolaget", () => {
    seedRng(113);
    try {
      const c = rival("Wellspring Invest");
      let s = makeState({ cash: 30_000_000, competitors: [c] });
      const cost = ddCostFor(s, c);
      expect(cost).toBeGreaterThanOrEqual(500_000);
      s = reducer(s, { type: "START_DUE_DILIGENCE", competitorName: c.name });
      expect(s.ddInProgress).toHaveLength(1);
      expect(ddDoneFor(s, c.name)).toBe(false);
      s = tick(s);
      s = tick(s);
      s = tick(s);
      expect(ddDoneFor(s, c.name)).toBe(true);
      expect(s.ddInProgress).toHaveLength(0);
      expect(s.log.some((e) => e.t.includes("DUE DILIGENCE COMPLETE"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("rådgivararvodet dras varje månad mandatet är aktivt", () => {
    seedRng(127);
    try {
      let on = makeState({ cash: 10_000_000, maAdvisor: true });
      let off = makeState({ cash: 10_000_000 });
      on = tick(on);
      off = tick(off);
      expect(off.cash - on.cash).toBeGreaterThanOrEqual(MA_ADVISOR_FEE - 2);
    } finally {
      clearRng();
    }
  });
});

describe("LIK I GARDEROBEN: DD skyddar, snålhet straffas", () => {
  function buyWithout(seed: number, dd: boolean): { skeleton: boolean; s: GameState } {
    seedRng(seed);
    try {
      const c = rival("City Core Group");
      const s0 = makeState({
        cash: 200_000_000,
        competitors: [c],
        ddDone: dd ? [c.name] : [],
      });
      const res = executeAcquisition(s0, c.name, 90_000_000, "kontant");
      expect(res.error).toBeUndefined();
      return { skeleton: res.state.log.some((l) => l.t.includes("SKELETONS")), s: res.state };
    } finally {
      clearRng();
    }
  }

  it("med DD: aldrig lik i garderoben; utan: risken finns och sänker skicket", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(buyWithout(seed, true).skeleton).toBe(false);
    }
    // Utan DD ska risken (25 %) materialiseras för åtminstone något frö.
    const outcomes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => buyWithout(seed, false));
    const hits = outcomes.filter((o) => o.skeleton);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length / outcomes.length).toBeLessThan(SKELETON_RISK * 2.5);
    // Skelettköpet skadade skicket på delar av beståndet.
    const hurt = hits[0].s.portfolio.filter((p) => p.id >= 7800 && p.condition < 80);
    expect(hurt.length).toBeGreaterThan(0);
  });

  it("DD-flaggan städas när bolaget köpts", () => {
    const c = rival("Sterling & Partners");
    const s0 = makeState({ cash: 200_000_000, competitors: [c], ddDone: [c.name] });
    const res = executeAcquisition(s0, c.name, 90_000_000, "kontant");
    expect(res.state.ddDone).toHaveLength(0);
  });
});
