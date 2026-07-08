/* Tester för yield on cost: driftnetto genom investerat kapital
   (inköpspris + förbättrings- och omkostnader). capexTotal ska växa
   vid underhåll, uppgraderingar, energiåtgärder och projekt – och
   nollställas när fastigheten säljs tillbaka till marknaden. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { propInvestedCost, propMarketValue, propNOI, propYieldOnCost } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("investerat kapital", () => {
  it("är inköpspris + ackumulerade åtgärder (askPrice som reserv)", () => {
    expect(propInvestedCost(makeProperty({ purchasePrice: 2_000_000, capexTotal: 300_000 }))).toBe(2_300_000);
    expect(propInvestedCost(makeProperty({ purchasePrice: 2_000_000 }))).toBe(2_000_000);
    expect(propInvestedCost(makeProperty({ askPrice: 1_500_000 }))).toBe(1_500_000);
  });

  it("yield on cost = NOI / investerat, oberoende av marknadsvärdet", () => {
    const s = makeState({});
    const p = makeProperty({ purchasePrice: 2_000_000, capexTotal: 500_000, tenants: [makeTenantFixture()] });
    expect(propYieldOnCost(p, s)).toBeCloseTo(propNOI(p, s) / 2_500_000, 10);
  });
});

describe("capexTotal ackumuleras vid åtgärder", () => {
  it("manuellt underhåll bokförs på fastigheten", () => {
    const p = makeProperty({ id: 1, condition: 50, purchasePrice: 1_000_000 });
    const s0 = makeState({ portfolio: [p] });
    const cost = Math.round(propMarketValue(p, s0) * 0.02);
    const s1 = reducer(s0, { type: "MAINTAIN", id: 1 });
    expect(s1.portfolio[0].capexTotal).toBe(cost);
    expect(s1.cash).toBe(s0.cash - cost);
  });

  it("underhållsrond (MAINTAIN_ALL) bokförs per fastighet", () => {
    const p = makeProperty({ id: 1, condition: 40, purchasePrice: 1_000_000 });
    const s0 = makeState({ portfolio: [p] });
    const s1 = reducer(s0, { type: "MAINTAIN_ALL", threshold: 60 });
    expect(s1.portfolio[0].capexTotal ?? 0).toBeGreaterThan(0);
  });

  it("energiuppgradering bokförs (klass D → C kostar 180 000)", () => {
    const p = makeProperty({ id: 1, energyClass: "D", purchasePrice: 1_000_000 });
    const s1 = reducer(makeState({ portfolio: [p] }), { type: "IMPROVE_ENERGY", id: 1 });
    expect(s1.portfolio[0].energyClass).toBe("C");
    expect(s1.portfolio[0].capexTotal).toBe(180_000);
  });

  it("utvecklingsprojekt bokförs vid start", () => {
    const p = makeProperty({ id: 1, purchasePrice: 1_000_000, tenants: [] });
    const s0 = makeState({ cash: 20_000_000, portfolio: [p] });
    const cost = Math.round(propMarketValue(p, s0) * 0.18);
    const s1 = reducer(s0, { type: "START_RENOVATION", id: 1, kind: "totalrenovering" });
    expect(s1.portfolio[0].capexTotal).toBe(cost);
  });

  it("förvaltarens auto-underhåll i simulationen bokförs", () => {
    const p = makeProperty({ id: 1, condition: 30, managed: true, purchasePrice: 1_000_000, tenants: [makeTenantFixture()] });
    const s1 = advanceMonth(makeState({ cash: 10_000_000, portfolio: [p] }));
    expect(s1.portfolio[0].capexTotal ?? 0).toBeGreaterThan(0);
  });
});

describe("capexTotal följer inte med vid försäljning", () => {
  it("SELL nollställer spelarens kostnadsbas", () => {
    const p = makeProperty({ id: 1, purchasePrice: 1_000_000, capexTotal: 400_000, tenants: [] });
    const s1 = reducer(makeState({ portfolio: [p] }), { type: "SELL", id: 1 });
    expect(s1.portfolio).toHaveLength(0);
    const back = [...s1.worldPool, ...s1.listings].find((x) => x.id === 1);
    if (back) expect(back.capexTotal).toBeUndefined();
  });
});
