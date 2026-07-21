/* Konjunkturmedvetna rivalstrategier: värdebolag dammsuger bust-marknaden
   och avvaktar i boomen, tillväxtbolag jagar boomen, utdelningsbolag
   amorterar dubbelt i bust. Plus: områdesbruset är väntevärdesneutralt –
   staden ska inte inflatera till Exklusivt av tidens gång. */

import { describe, expect, it } from "vitest";
import { strategyBias } from "../engine/rivalFinance";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import { DISTRICTS } from "../engine/data";
import type { Competitor, GameState, Property } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(over: Partial<Competitor> = {}): Competitor {
  return {
    name: "Testbolaget",
    cash: 60_000_000,
    units: 0,
    equity: 60_000_000,
    portfolio: [],
    strategy: "värde",
    ...over,
  };
}

describe("STRATEGYBIAS: fasprofil per strategi", () => {
  it("värdebolag är kontracykliska", () => {
    const c = rival({ strategy: "värde" });
    expect(strategyBias(c, "bust").buy).toBeGreaterThan(1.5);
    expect(strategyBias(c, "boom").buy).toBeLessThan(0.7);
  });

  it("tillväxtbolag jagar boomen och fryser byggena i bust", () => {
    const c = rival({ strategy: "tillväxt" });
    expect(strategyBias(c, "boom").build).toBeGreaterThan(1.3);
    expect(strategyBias(c, "bust").build).toBe(0);
    expect(strategyBias(c, "boom").amort).toBeLessThan(1);
  });

  it("utdelningsbolag skyddar balansräkningen i bust", () => {
    const c = rival({ strategy: "utdelning" });
    expect(strategyBias(c, "bust").amort).toBeGreaterThan(2);
    expect(strategyBias(c, "bust").buy).toBeLessThan(0.7);
  });
});

describe("SIMULERINGEN: värdebolaget köper i bust, inte i boom", () => {
  function run(phase: "boom" | "bust", seed: number): number {
    seedRng(seed);
    try {
      let bought = 0;
      const listings = (): Property[] =>
        Array.from({ length: 6 }, (_, i) =>
          makeProperty({ id: 7000 + i, owned: false, status: "klar", askPrice: 8_000_000 + i * 500_000 }),
        );
      let s = makeState({
        competitors: [rival({ strategy: "värde", cash: 200_000_000 })],
        listings: listings(),
      });
      for (let m = 0; m < 40; m++) {
        // Pinna fasen inför varje tick (hysteresen i cycle.ts låter den ligga
        // kvar en enstaka månad; vi återställer också utbud och kassa).
        s = {
          ...s,
          marketCycle: { phase, monthsRemaining: 12, age: 1 },
          listings: listings(),
        };
        s.competitors = s.competitors.map((c) => ({ ...c, cash: 200_000_000, debt: 0 }));
        const before = s.competitors[0]?.portfolio.length ?? 0;
        s = tick(s);
        const after = s.competitors[0]?.portfolio.length ?? 0;
        if (after > before) bought += after - before;
      }
      return bought;
    } finally {
      clearRng();
    }
  }

  it("köpvolymen i bust överstiger boomens klart", () => {
    const bust = run("bust", 41) + run("bust", 43);
    const boom = run("boom", 41) + run("boom", 43);
    expect(bust).toBeGreaterThan(boom);
  }, 60_000);
});

describe("OMRÅDESUTVECKLING: ingen gratisinflation", () => {
  it("en tom stad utan spelare driver inte mot Exklusivt på tio år", () => {
    seedRng(47);
    try {
      let s = makeState({ competitors: [] });
      for (let m = 0; m < 120; m++) s = tick(s);
      const devs = DISTRICTS.map((d) => s.districtDev?.[d.id] ?? 1);
      const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
      // Vänte­värdesneutralt brus: snittet ska ligga nära 1.0 (enstaka
      // infra-invigningar får lyfta ETT distrikt, inte hela staden).
      expect(avg).toBeLessThan(1.06);
      expect(avg).toBeGreaterThan(0.9);
    } finally {
      clearRng();
    }
  }, 60_000);
});
