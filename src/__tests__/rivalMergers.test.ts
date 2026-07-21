/* Motivdriven M&A: fusioner kräver ett skäl – ett nödställt byte, en fejd
   med styrkeövertag eller en allians som utmanar ledaren. Utan motiv (och
   under fyra aktörer) konsolideras ingenting. */

import { describe, expect, it } from "vitest";
import { HOSTILE_EQUITY_RATIO, pickMerger } from "../engine/rivalArcs";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState, RivalRelation } from "../engine/types";
import { makeState } from "./factories";

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return {
    name,
    cash: 30_000_000,
    units: 0,
    equity: 100_000_000,
    portfolio: [],
    strategy: "värde",
    ...over,
  };
}

function four(over: Record<string, Partial<Competitor>> = {}): Competitor[] {
  return ["Alfa", "Beta", "Gamma", "Delta"].map((n) => rival(n, over[n] ?? {}));
}

const feud = (a: string, b: string): RivalRelation => ({ a, b, kind: "feud", since: 0 });
const ally = (a: string, b: string): RivalRelation => ({ a, b, kind: "alliance", since: 0 });

describe("PICKMERGER: affärer kräver motiv", () => {
  it("ingen plan utan motiv eller under fyra aktörer", () => {
    expect(pickMerger(makeState({ competitors: four() }))).toBeNull();
    const s = makeState({
      competitors: four({ Beta: { cash: -5_000_000 } }).slice(0, 3),
    });
    expect(pickMerger(s)).toBeNull();
  });

  it("opportunistiskt: nödställt bolag köps av den mest kapitaliserade", () => {
    const s = makeState({
      competitors: four({
        Beta: { cash: -2_000_000, equity: 60_000_000 },
        Delta: { cash: 90_000_000 },
      }),
    });
    const plan = pickMerger(s);
    expect(plan).toMatchObject({ kind: "opportunistic", buyer: "Delta", target: "Beta" });
  });

  it("ICR-pressade bolag är också byten", () => {
    const s = makeState({
      competitors: four({
        Gamma: { icrBadMonths: 2, equity: 50_000_000 },
        Alfa: { cash: 120_000_000 },
      }),
    });
    expect(pickMerger(s)).toMatchObject({ kind: "opportunistic", target: "Gamma" });
  });

  it("fientligt: fejd + styrkeövertag ≥ 3×", () => {
    const s = makeState({
      competitors: four({
        Alfa: { equity: 400_000_000, cash: 100_000_000 },
        Beta: { equity: 100_000_000 },
      }),
      rivalRelations: [feud("Alfa", "Beta")],
    });
    expect(pickMerger(s)).toMatchObject({ kind: "hostile", buyer: "Alfa", target: "Beta" });
    // Utan övertaget uteblir övertagandet.
    const even = makeState({
      competitors: four({ Alfa: { equity: 200_000_000 }, Beta: { equity: 100_000_000 } }),
      rivalRelations: [feud("Alfa", "Beta")],
    });
    expect(pickMerger(even)).toBeNull();
    expect(HOSTILE_EQUITY_RATIO).toBe(3);
  });

  it("vänskapligt: allierade i mellanskiktet utmanar ledaren tillsammans", () => {
    const s = makeState({
      competitors: four({
        Alfa: { equity: 500_000_000 }, // ledaren står utanför
        Beta: { equity: 250_000_000 },
        Gamma: { equity: 220_000_000 },
      }),
      rivalRelations: [ally("Beta", "Gamma")],
    });
    const plan = pickMerger(s);
    expect(plan).toMatchObject({ kind: "friendly", buyer: "Beta", target: "Gamma" });
    // En allians som inkluderar ledaren formaliseras inte.
    const withLeader = makeState({
      competitors: four({ Alfa: { equity: 500_000_000 }, Beta: { equity: 250_000_000 } }),
      rivalRelations: [ally("Alfa", "Beta")],
    });
    expect(pickMerger(withLeader)).toBeNull();
  });
});

describe("SIMULERINGEN: uppköpet genomförs med skulden på köpet", () => {
  it("nödställt bolag absorberas – skuld, hus och industrier följer med", () => {
    seedRng(17);
    try {
      let s: GameState = makeState({
        competitors: four({
          Beta: { cash: -3_000_000, equity: 40_000_000, debt: 80_000_000 },
          Delta: { cash: 150_000_000, debt: 20_000_000 },
        }),
      });
      let merged = false;
      for (let m = 0; m < 60 && !merged; m++) {
        s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
        merged = !s.competitors.some((c) => c.name === "Beta");
      }
      expect(merged).toBe(true);
      // Betas skuld ska ha landat hos en kvarvarande köpare – den samlade
      // skulden i systemet får inte ha minskat av själva affären (bara av
      // amorteringar/nödförsäljningar längs vägen).
      expect(s.competitors.length).toBe(3);
      const buyer = s.competitors.find((c) => (c.debt ?? 0) > 20_000_000);
      expect(buyer).toBeDefined();
      expect(s.log.some((e) => e.t.includes("ACQUISITION") || e.t.includes("TAKEOVER") || e.t.includes("MERGER"))).toBe(true);
    } finally {
      clearRng();
    }
  }, 60_000);
});
