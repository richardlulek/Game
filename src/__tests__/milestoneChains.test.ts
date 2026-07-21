/* Milstolpekedjor: fleretappersmål med permanenta belöningar som förstärker
   den spelstil de mäter – byggrabatt, ansökningsflöde, slitageskydd och
   förstärkta områdessatsningar. */

import { describe, expect, it } from "vitest";
import { applicationRate } from "../engine/leasing";
import {
  CHAINS,
  chainAppFlowMult,
  chainBuildCostMult,
  chainInvestBoostMult,
  chainLevel,
  chainWearMult,
} from "../engine/milestoneChains";
import { wearMult } from "../engine/progression";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("KEDJEEFFEKTERNA: nivåerna ger permanenta multiplikatorer", () => {
  it("effekterna skalar med nivån och är neutrala utan", () => {
    const none = makeState({});
    expect(chainBuildCostMult(none)).toBe(1);
    expect(chainAppFlowMult(none)).toBe(1);
    expect(chainWearMult(none)).toBe(1);
    expect(chainInvestBoostMult(none)).toBe(1);
    const maxed = makeState({
      chainLevels: { byggmastaren: 3, hyresvarden: 3, renoveraren: 3, stadsbyggaren: 3 },
    });
    expect(chainBuildCostMult(maxed)).toBeCloseTo(0.91, 3);
    expect(chainAppFlowMult(maxed)).toBeCloseTo(1.06, 3);
    expect(chainWearMult(maxed)).toBeCloseTo(0.88, 3);
    expect(chainInvestBoostMult(maxed)).toBeCloseTo(1.45, 3);
  });

  it("slitage och ansökningsflöde läser kedjenivåerna", () => {
    const s0 = makeState({});
    const s3 = makeState({ chainLevels: { renoveraren: 3, hyresvarden: 3 } });
    expect(wearMult(s3)).toBeCloseTo(wearMult(s0) * 0.88, 3);
    const p = makeProperty({ capacity: 4, tenants: [] });
    expect(applicationRate(p, s3, 1)).toBeCloseTo(applicationRate(p, s0, 1) * 1.06, 4);
  });
});

describe("RÄKNARNA: handlingar bygger kedjorna", () => {
  it("områdessatsning räknar Stadsbyggaren och förstärks av nivån", () => {
    const s = makeState({ cash: 60_000_000 });
    const after = reducer(s, { type: "INVEST_DISTRICT", districtId: "centrum", amount: 25_000_000 });
    expect(after.chainCounters?.cityWorks).toBe(1);
    const boosted = reducer(
      makeState({ cash: 60_000_000, chainLevels: { stadsbyggaren: 2 } }),
      { type: "INVEST_DISTRICT", districtId: "centrum", amount: 25_000_000 },
    );
    const boost = (st: GameState) => st.infraProjects?.[0]?.boost ?? 0;
    expect(boost(boosted)).toBeCloseTo(boost(after) * 1.3, 3);
  });

  it("färdig nyproduktion räknar Byggmästaren och låser upp nivå I", () => {
    seedRng(83);
    try {
      let s = makeState({
        cash: 20_000_000,
        portfolio: [
          makeProperty({ id: 9970, type: "bostad", status: "bygger", buildLeft: 1, tenants: [] }),
        ],
      });
      s = tick(s);
      expect(s.chainCounters?.builds).toBe(1);
      expect(chainLevel(s, "byggmastaren")).toBe(1);
      expect(s.log.some((e) => e.t.includes("CHAIN MILESTONE") && e.t.includes("Master Builder"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("nöjda hyresgäster mäts direkt – nivå I vid tio stycken", () => {
    seedRng(89);
    try {
      const tenants = Array.from({ length: 12 }, (_, i) =>
        makeTenantFixture({ id: 9600 + i, satisfaction: 90, monthsLeft: 24 }),
      );
      let s = makeState({
        portfolio: [makeProperty({ id: 9980, capacity: 12, tenants })],
      });
      s = tick(s);
      expect(chainLevel(s, "hyresvarden")).toBeGreaterThanOrEqual(1);
    } finally {
      clearRng();
    }
  });

  it("kedjedefinitionerna är konsistenta (tre stigande steg)", () => {
    for (const chain of CHAINS) {
      expect(chain.steps).toHaveLength(3);
      expect(chain.steps[0].target).toBeLessThan(chain.steps[1].target);
      expect(chain.steps[1].target).toBeLessThan(chain.steps[2].target);
    }
  });
});
