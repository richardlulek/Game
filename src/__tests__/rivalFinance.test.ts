/* Rivalernas balansräkningar: skuld, räntekänslighet och nödförsäljningar.
   Rivalerna ska belåna sina köp, betala ränta varje månad, amortera ur
   överskott och tvingas till nödförsäljning när räntetäckningen brister –
   samma tyngdlag som gäller spelaren. */

import { describe, expect, it } from "vitest";
import { initState } from "../engine/initState";
import {
  RIVAL_ICR_GRACE_MONTHS,
  applyDistressProceeds,
  rivalFinancePurchase,
  rivalICR,
  rivalInterest,
  rivalLeverage,
  rivalRateSpread,
} from "../engine/rivalFinance";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function makeRival(over: Partial<Competitor> = {}): Competitor {
  return {
    name: "Testbolaget",
    cash: 3_000_000,
    units: 0,
    equity: 3_000_000,
    portfolio: [],
    strategy: "värde",
    ...over,
  };
}

describe("BALANSRÄKNINGEN: belåning, spread och räntetäckning", () => {
  it("belåningsgrad och spread följer strategi och storlek", () => {
    expect(rivalLeverage(makeRival({ strategy: "tillväxt" }))).toBe(0.65);
    expect(rivalLeverage(makeRival({ strategy: "värde" }))).toBe(0.45);
    expect(rivalLeverage(makeRival({ institutional: true, strategy: "tillväxt" }))).toBe(0);
    // Små bolag betalar mer, tillväxtbolag därtill en riskpremie.
    expect(rivalRateSpread(makeRival({ equity: 10_000_000 }))).toBe(1.1);
    expect(rivalRateSpread(makeRival({ equity: 400_000_000 }))).toBe(0.4);
    expect(rivalRateSpread(makeRival({ equity: 400_000_000, strategy: "tillväxt" }))).toBeCloseTo(0.8, 2);
  });

  it("räntan räknas på skulden och ICR på NOI/ränta", () => {
    const s = makeState({ interestRate: 5.0 });
    const c = makeRival({ debt: 120_000_000, equity: 10_000_000, monthlyNOI: 400_000 });
    // 120M × (5.0 + 1.1) % / 12 = 610 000
    expect(rivalInterest(s, c)).toBe(610_000);
    expect(rivalICR(s, c)).toBeCloseTo(400_000 / 610_000, 2);
    expect(rivalICR(s, makeRival({ debt: 0 }))).toBe(Infinity);
  });

  it("köp finansieras med belåning: kassan bär bara eget kapitaldelen", () => {
    const c = makeRival({ strategy: "tillväxt", cash: 40_000_000 });
    rivalFinancePurchase(c, 100_000_000);
    expect(c.debt).toBe(65_000_000);
    expect(c.cash).toBe(5_000_000);
  });

  it("nödförsäljningens intäkter betalar ned skulden först", () => {
    const c = makeRival({ debt: 50_000_000, cash: -2_000_000 });
    const r = applyDistressProceeds(c, 20_000_000);
    expect(r.debt).toBe(36_000_000); // −70 % av köpeskillingen
    expect(r.cash).toBe(4_000_000); // resten till kassan
  });
});

describe("STARTLÄGET: rivalerna föds med belånade böcker", () => {
  it("initState ger skuld efter strategi och equity netto", () => {
    const s = initState();
    for (const c of s.competitors) {
      const portVal = c.portfolio.reduce((a, p) => a + p.askPrice, 0);
      expect(c.debt ?? 0).toBeGreaterThan(0);
      // Uppstickarna ligger på exakt 55 % start-LTV, de stora lägre.
      expect(c.debt!).toBeLessThanOrEqual(Math.round(portVal * 0.55));
      expect(c.equity).toBe(c.cash + portVal - c.debt!);
    }
  });
});

describe("SIMULERINGEN: räntan biter varje månad", () => {
  it("skuldsatt rival tappar kassa mot en skuldfri tvilling", () => {
    seedRng(21);
    try {
      const twin = (name: string, debt: number) =>
        makeRival({ name, debt, cash: 3_000_000, equity: 3_000_000 });
      let s = makeState({
        interestRate: 6.0,
        competitors: [twin("Skuldsatt AB", 100_000_000), twin("Skuldfritt AB", 0)],
      });
      s = tick(s);
      const indebted = s.competitors.find((c) => c.name === "Skuldsatt AB")!;
      const free = s.competitors.find((c) => c.name === "Skuldfritt AB")!;
      // ~100M × 7.1 %/12 ≈ 590 000 i månadsränta.
      expect(indebted.cash).toBeLessThan(free.cash - 400_000);
      // NOI 0 < räntan ⇒ ICR-vakten börjar räkna.
      expect(indebted.icrBadMonths).toBe(1);
      expect(free.icrBadMonths ?? 0).toBe(0);
    } finally {
      clearRng();
    }
  });

  it("ICR < 1 i tre månader tvingar fram nödförsäljning som sänker skulden", () => {
    seedRng(29);
    try {
      const house = makeProperty({ id: 9900, district: "hamnen", owned: false, askPrice: 30_000_000 });
      let s = makeState({
        interestRate: 8.0,
        competitors: [
          makeRival({ name: "Överbelånat AB", debt: 200_000_000, cash: 2_000_000, portfolio: [house] }),
        ],
      });
      let sold = false;
      for (let m = 0; m < 14 && !sold; m++) {
        s = tick(s);
        sold = s.log.some((e) => e.t.includes("Distress sale"));
      }
      expect(sold).toBe(true);
      const c = s.competitors.find((x) => x.name === "Överbelånat AB");
      // Antingen såldes huset (skulden ned) eller bolaget fusionerades bort –
      // med en ensam rival finns ingen fusion, så bolaget ska finnas kvar.
      expect(c).toBeDefined();
      expect(c!.debt!).toBeLessThan(200_000_000);
      expect(c!.portfolio).toHaveLength(0);
      expect((c!.icrBadMonths ?? 0)).toBeGreaterThanOrEqual(0);
    } finally {
      clearRng();
    }
  });

  it("i bust amorterar utdelningsbolaget ned skulden – i goda tider rullas lånen", () => {
    seedRng(31);
    try {
      // Stort bestånd ger NOI som täcker räntan; kassa långt över bufferten.
      const houses = Array.from({ length: 4 }, (_, i) =>
        makeProperty({ id: 9910 + i, owned: false, askPrice: 40_000_000 }),
      );
      const base = () =>
        makeState({
          interestRate: 3.0,
          competitors: [
            makeRival({ name: "Amorterarna", strategy: "utdelning", debt: 60_000_000, cash: 45_000_000, portfolio: [...houses] }),
          ],
        });
      // Bust: balansräkningen skyddas – skulden betalas ned.
      let bust = base();
      bust.marketCycle = { phase: "bust", monthsRemaining: 6, age: 1 };
      bust = tick(bust);
      const cb = bust.competitors.find((x) => x.name === "Amorterarna")!;
      expect(cb.debt!).toBeLessThan(60_000_000);
      expect(cb.icrBadMonths ?? 0).toBe(0);
      // Stabilt läge med god räntetäckning: lånen rullas, inget amorteras.
      let calm = base();
      calm.marketCycle = { phase: "stable", monthsRemaining: 6, age: 1 };
      calm = tick(calm);
      const cc = calm.competitors.find((x) => x.name === "Amorterarna")!;
      expect(cc.debt!).toBe(60_000_000);
    } finally {
      clearRng();
    }
  });

  it("gracetiden är tre månader", () => {
    expect(RIVAL_ICR_GRACE_MONTHS).toBe(3);
  });
});
