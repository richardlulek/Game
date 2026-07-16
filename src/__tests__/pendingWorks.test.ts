/* Beställda arbeten (anti paus-exploit): underhåll, uppgraderingar,
   energiåtgärder, kampanjer och ändrad användning betalas direkt men
   får effekt först vid månadsskiftet. Hyresgästerna bor kvar och
   betalar hyra under hela arbetet – värdet kan inte flippas med
   stillastående klocka. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingWork, propMarketValue } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("underhåll tar en månad", () => {
  it("betalas direkt, +15 skick först vid månadsskiftet", () => {
    const p = makeProperty({ id: 1, condition: 40 });
    const s0 = makeState({ cash: 10_000_000, portfolio: [p] });
    const s1 = reducer(s0, { type: "MAINTAIN", id: 1 });
    expect(s1.cash).toBeLessThan(s0.cash);
    expect(s1.portfolio[0].condition).toBe(40);
    expect(pendingWork(s1.portfolio[0], "underhåll")).toBeDefined();
    // Marknadsvärdet är alltså oförändrat – inget att sälja dyrare i paus.
    expect(propMarketValue(s1.portfolio[0], s1)).toBe(propMarketValue(p, s0));
    const s2 = advanceMonth(s1);
    expect(s2.portfolio[0].condition).toBeGreaterThanOrEqual(54); // 40 + 15 − slitage
    expect(pendingWork(s2.portfolio[0], "underhåll")).toBeUndefined();
  });

  it("en-i-taget: andra beställningen drar inga pengar", () => {
    const p = makeProperty({ id: 1, condition: 40 });
    const s1 = reducer(makeState({ cash: 10_000_000, portfolio: [p] }), { type: "MAINTAIN", id: 1 });
    const s2 = reducer(s1, { type: "MAINTAIN", id: 1 });
    expect(s2.cash).toBe(s1.cash);
    expect(s2.portfolio[0].pendingWorks).toHaveLength(1);
  });

  it("hyresgästerna bor kvar och hyran flyter under arbetet", () => {
    const tenant = makeTenantFixture({ id: 7, rent: 50_000, monthsLeft: 24 });
    const p = makeProperty({ id: 1, condition: 40, tenants: [tenant], capacity: 1 });
    const s1 = reducer(makeState({ cash: 10_000_000, portfolio: [p], debt: 0 }), { type: "MAINTAIN", id: 1 });
    const s2 = advanceMonth(s1);
    // Kontraktet är orört och månaden gav hyresintäkt trots pågående jobb.
    expect(s2.portfolio[0].tenants.map((t) => t.id)).toContain(7);
    expect(s2.portfolio[0].totalEarnedRent ?? 0).toBeGreaterThan(0);
  });
});

describe("uppgraderingar och energi", () => {
  it("tillbyggnad: effekt och ✓ först efter tre månader", () => {
    const p = makeProperty({ id: 1 });
    const s0 = makeState({ cash: 100_000_000, portfolio: [p] });
    let s = reducer(s0, { type: "UPGRADE", id: 1, upg: "tillbygg" });
    expect(s.cash).toBeLessThan(s0.cash);
    expect(s.portfolio[0].valueMult).toBe(1);
    expect(s.portfolio[0].upgrades).not.toContain("tillbygg");
    for (let i = 0; i < 3; i++) {
      expect(s.portfolio[0].upgrades).not.toContain("tillbygg");
      s = advanceMonth(s);
    }
    expect(s.portfolio[0].upgrades).toContain("tillbygg");
    expect(s.portfolio[0].valueMult).toBeCloseTo(1.25, 5);
  });

  it("samma uppgradering kan inte dubbelbeställas", () => {
    const p = makeProperty({ id: 1 });
    const s1 = reducer(makeState({ cash: 100_000_000, portfolio: [p] }), { type: "UPGRADE", id: 1, upg: "smart" });
    const s2 = reducer(s1, { type: "UPGRADE", id: 1, upg: "smart" });
    expect(s2).toBe(s1);
  });

  it("energiåtgärden byter klass först vid ticken", () => {
    const p = makeProperty({ id: 1, energyClass: "E" });
    const s1 = reducer(makeState({ cash: 10_000_000, portfolio: [p] }), { type: "IMPROVE_ENERGY", id: 1 });
    expect(s1.portfolio[0].energyClass).toBe("E");
    const s2 = advanceMonth(s1);
    expect(s2.portfolio[0].energyClass).toBe("D");
    // Blockeras medan jobbet pågår.
    expect(reducer(s1, { type: "IMPROVE_ENERGY", id: 1 })).toBe(s1);
  });
});

describe("ändrad användning blockerar nya kontrakt under ombyggnaden", () => {
  it("LEASE nekas tills ombyggnaden är klar", () => {
    const p = makeProperty({ id: 1, type: "bostad", tenants: [], applications: [] });
    let s = reducer(makeState({ cash: 50e6, portfolio: [p] }), { type: "CHANGE_USE", id: 1, propType: "kontor" });
    const blocked = reducer(s, { type: "LEASE", id: 1 });
    expect(blocked.log[0].t).toContain("conversion");
    for (let i = 0; i < 3; i++) s = advanceMonth(s);
    expect(s.portfolio[0].type).toBe("kontor");
  });
});

describe("kantfall", () => {
  it("jobbet dör med fastigheten vid försäljning – ingen refund", () => {
    const p = makeProperty({ id: 1, condition: 40, parcelId: undefined });
    const s1 = reducer(makeState({ cash: 10_000_000, portfolio: [p] }), { type: "MAINTAIN", id: 1 });
    const cashAfterOrder = s1.cash;
    const s2 = reducer(s1, { type: "SELL", id: 1 });
    expect(s2.portfolio).toHaveLength(0);
    // Försäljningen gav kvickförsäljningspriset – inte jobbkostnaden tillbaka.
    expect(s2.cash).toBeGreaterThan(cashAfterOrder);
    expect(advanceMonth(s2).portfolio).toHaveLength(0); // inget spökjobb
  });

  it("jobb tickar även om fastigheten går in i bygge", () => {
    const p = makeProperty({ id: 1, condition: 40, tenants: [] });
    let s = reducer(makeState({ cash: 100_000_000, portfolio: [p] }), { type: "MAINTAIN", id: 1 });
    s = reducer(s, { type: "START_RENOVATION", id: 1, kind: "totalrenovering" });
    expect(s.portfolio[0].status).toBe("bygger");
    const after = advanceMonth(s);
    expect(pendingWork(after.portfolio[0], "underhåll")).toBeUndefined(); // jobbet löstes
  });
});
