/* Tester för bolagspolicyn: standarder med per-fastighet-överstyrning
   och chefsgatad verkställighet (direktör/CFO/förvaltningschef). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveAskRent } from "../engine/leasing";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { Application } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

let seq = 7000;
const app = (quality: number, rent = 12_000): Application => ({
  id: ++seq,
  tenant: makeTenantFixture({ id: seq, quality, rent }),
  expiresAbs: 99,
});

describe("policy: utgångshyra med överstyrning", () => {
  it("fastighetens egen inställning går före policyn", () => {
    const s = makeState({ policy: { askRentPct: 1.1 } });
    expect(effectiveAskRent(makeProperty({}), s)).toBe(1.1);
    expect(effectiveAskRent(makeProperty({ askRentPct: 0.9 }), s)).toBe(0.9);
    expect(effectiveAskRent(makeProperty({}), makeState({}))).toBe(1);
  });

  it("SET_POLICY uppdaterar delvis och behåller resten", () => {
    let s = reducer(makeState({}), { type: "SET_POLICY", policy: { askRentPct: 1.05 } });
    s = reducer(s, { type: "SET_POLICY", policy: { rejectBelowQuality: 0.95 } });
    expect(s.policy?.askRentPct).toBe(1.05);
    expect(s.policy?.rejectBelowQuality).toBe(0.95);
  });
});

describe("policy: auto-accept kräver portföljdirektör", () => {
  const base = () =>
    makeProperty({ id: 1, capacity: 2, tenants: [], applications: [app(1.05), app(0.9)] });

  it("med direktör accepteras bästa ansökan med policyns kontrakt", () => {
    const s0 = makeState({
      portfolio: [base()],
      globalManager: { active: true, minCondition: 45, rentTargetPct: 1, minTenantQuality: 0 },
      policy: { autoAccept: { enabled: true, minQuality: 1.0, contract: "långt" } },
    });
    const s1 = advanceMonth(s0);
    expect(s1.portfolio[0].tenants.length).toBeGreaterThan(0);
    const t = s1.portfolio[0].tenants[0];
    expect(t.quality).toBeGreaterThanOrEqual(1.0);
    expect(t.termTotal).toBeGreaterThanOrEqual(60); // långt kontrakt
  });

  it("utan direktör ligger policyn vilande", () => {
    const s0 = makeState({
      portfolio: [base()],
      policy: { autoAccept: { enabled: true, minQuality: 1.0, contract: "standard" } },
    });
    const s1 = advanceMonth(s0);
    expect(s1.portfolio[0].tenants).toHaveLength(0);
  });

  it("inkorgspolicyn avslår ansökningar under kvalitetsgränsen", () => {
    const s0 = makeState({
      portfolio: [makeProperty({ id: 1, capacity: 3, tenants: [makeTenantFixture({ id: 1 })], applications: [app(0.85), app(1.1)] })],
      globalManager: { active: true, minCondition: 45, rentTargetPct: 1, minTenantQuality: 0.99 },
      policy: { rejectBelowQuality: 0.95 },
    });
    const s1 = advanceMonth(s0);
    // 1.1-ansökan accepterades av direktören; 0.85 rensades av inkorgspolicyn
    expect((s1.portfolio[0].applications ?? []).every((a) => a.tenant.quality >= 0.95)).toBe(true);
  });
});

describe("policy: CFO amorterar mot mål-LTV", () => {
  it("amorterar ned mot målet med bibehållen buffert – bara med CFO", () => {
    const prop = makeProperty({ id: 1, tenants: [makeTenantFixture()] });
    const mk = (staff: Record<string, number>) =>
      makeState({
        cash: 10_000_000,
        debt: 8_000_000,
        portfolio: [prop],
        staff,
        policy: { autoAmort: { enabled: true, ltvTarget: 0.1, cashFloor: 2_000_000 } },
      });
    const withCfo = advanceMonth(mk({ cfo: 1 }));
    const without = advanceMonth(mk({}));
    expect(withCfo.debt).toBeLessThan(without.debt);
    expect(withCfo.cash).toBeGreaterThanOrEqual(2_000_000 - 100_000); // buffert respekteras (± månadsflöden)
    expect(withCfo.log.some((l) => l.t.includes("CFO-policyn"))).toBe(true);
  });
});

describe("policy: förvaltningschefens skydd och energi", () => {
  it("försäkrar automatiskt fastigheter över värdegränsen", () => {
    const big = makeProperty({ id: 1, area: 3000, tenants: [makeTenantFixture()] });
    const s0 = makeState({
      portfolio: [big],
      staff: { forvaltning: 1 },
      policy: { autoInsure: { enabled: true, minValue: 1_000_000 } },
    });
    const s1 = advanceMonth(s0);
    expect(s1.portfolio[0].insurance).toBe(true);
    expect(s1.log.some((l) => l.t.includes("Skyddspolicyn"))).toBe(true);
  });

  it("energiuppgraderar en fastighet per månad mot målklassen", () => {
    const p = makeProperty({ id: 1, energyClass: "D", tenants: [makeTenantFixture()] });
    const s0 = makeState({
      cash: 10_000_000,
      portfolio: [p],
      staff: { forvaltning: 1 },
      policy: { autoEnergy: { enabled: true, targetClass: "B", cashFloor: 1_000_000 } },
    });
    const s1 = advanceMonth(s0);
    expect(s1.portfolio[0].energyClass).toBe("C"); // ett steg per månad
    expect(s1.log.some((l) => l.t.includes("Energipolicyn"))).toBe(true);
    const s2 = advanceMonth({ ...s1, log: [] });
    expect(s2.portfolio[0].energyClass).toBe("B"); // klar vid målet
    const s3 = advanceMonth({ ...s2, log: [] });
    expect(s3.portfolio[0].energyClass).toBe("B"); // stannar där
    expect(s3.log.some((l) => l.t.includes("Energipolicyn"))).toBe(false);
  });
});
