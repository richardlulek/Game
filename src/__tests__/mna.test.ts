/* Förvärvsvärderingen: substansvärde netto skuld + kapitaliserade synergier
   (distriktsöverlapp, energi, stordrift) – och ACQUIRE_RIVAL tar över
   skulden på riktigt i stället för att låta den förångas. */

import { describe, expect, it } from "vitest";
import { acquisitionValuation } from "../engine/mna";
import { propMarketValue } from "../engine/property";
import { reducer } from "../engine/reducer";
import { acquisitionLtv } from "../engine/finance";
import { acquiredAssetValue } from "../engine/mna";
import type { Competitor } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function rival(over: Partial<Competitor> = {}): Competitor {
  return {
    name: "Målbolaget AB",
    cash: 10_000_000,
    units: 0,
    equity: 100_000_000,
    portfolio: [],
    strategy: "värde",
    ...over,
  };
}

describe("FÖRVÄRVSVÄRDERINGEN: substans + synergier", () => {
  it("NAV = marknadsvärde + industri + kassa − skuld", () => {
    const s = makeState({});
    const houses = [
      makeProperty({ id: 8000, district: "hamnen", owned: false }),
      makeProperty({ id: 8001, district: "hamnen", owned: false }),
    ];
    const comp = rival({ portfolio: houses, cash: 12_000_000, debt: 30_000_000 });
    const val = acquisitionValuation(s, comp);
    const mv = Math.round(houses.reduce((a, p) => a + propMarketValue(p, s), 0));
    expect(val.propertyValue).toBe(mv);
    expect(val.cash).toBe(12_000_000);
    expect(val.debt).toBe(30_000_000);
    expect(val.nav).toBe(mv + 12_000_000 - 30_000_000);
    // Utan egna hus/MW: inga synergier.
    expect(val.synergies.total).toBe(0);
    expect(val.totalValue).toBe(val.nav);
  });

  it("distriktsöverlapp kräver ≥ 2 egna färdiga hus i distriktet", () => {
    const targetHouse = makeProperty({ id: 8010, district: "centrum", owned: false });
    const comp = rival({ portfolio: [targetHouse], cash: 0 });
    const none = acquisitionValuation(
      makeState({ portfolio: [makeProperty({ id: 1, district: "centrum" })] }),
      comp,
    );
    expect(none.synergies.district).toBe(0);
    const s = makeState({
      portfolio: [1, 2].map((n) => makeProperty({ id: n, district: "centrum" })),
    });
    const overlap = acquisitionValuation(s, comp);
    expect(overlap.synergies.district).toBe(Math.round(propMarketValue(targetHouse, s) * 0.05));
    expect(overlap.totalValue).toBeGreaterThan(overlap.nav);
  });

  it("egna megawatt ger kapitaliserad energisynergi", () => {
    const comp = rival({ portfolio: [makeProperty({ id: 8020, owned: false })], cash: 0 });
    const noMw = acquisitionValuation(makeState({ energyOwnedMW: 0 }), comp);
    const withMw = acquisitionValuation(makeState({ energyOwnedMW: 40 }), comp);
    expect(noMw.synergies.energy).toBe(0);
    expect(withMw.synergies.energy).toBeGreaterThan(0);
  });

  it("stordriften växer med egen portfölj och slår i taket", () => {
    const comp = rival({ portfolio: [makeProperty({ id: 8030, owned: false })], cash: 0 });
    const small = acquisitionValuation(makeState({}), comp);
    const mid = acquisitionValuation(
      makeState({ portfolio: Array.from({ length: 10 }, (_, i) => makeProperty({ id: 100 + i, district: "hamnen" })) }),
      comp,
    );
    const huge = acquisitionValuation(
      makeState({ portfolio: Array.from({ length: 60 }, (_, i) => makeProperty({ id: 200 + i, district: "hamnen" })) }),
      comp,
    );
    expect(small.synergies.scale).toBe(0);
    expect(mid.synergies.scale).toBeGreaterThan(0);
    // Tak 3 %: 60 hus ger inte mer än taket.
    expect(huge.synergies.scale).toBe(Math.round(huge.propertyValue * 0.03));
  });
});

describe("ACQUIRE_RIVAL: skulden följer med köpet", () => {
  it("rivalens lånestock läggs på koncernens skuld", () => {
    const comp = rival({
      portfolio: [makeProperty({ id: 8040, owned: false, askPrice: 20_000_000 })],
      cash: 5_000_000,
      debt: 40_000_000,
      equity: 30_000_000,
    });
    const s = makeState({ cash: 60_000_000, competitors: [comp] });
    const price = Math.round(comp.equity * 1.35);
    const after = reducer(s, { type: "ACQUIRE_RIVAL", competitorName: comp.name, amount: price });
    expect(after.competitors).toHaveLength(0);
    // Skuld = förvärvslånet + rivalens övertagna 40M. Lånet tas mot det
    // förvärvade beståndet, inte mot priset, så en premie över
    // tillgångsvärdet får betalas kontant.
    const assets = acquiredAssetValue(s, comp);
    expect(after.debt).toBe(Math.min(price - Math.round(price * 0.25), Math.round(assets * acquisitionLtv(s))) + 40_000_000);
    expect(after.log[0].t).toContain("assumed debt");
  });
});
