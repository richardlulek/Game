/* Tester för portföljbatch-åtgärder (Cap Lab-stil: mindre mikroklick). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reducer } from "../engine/reducer";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LEASE_ALL", () => {
  const app = (id: number, tenantId: number) => ({
    id,
    tenant: makeTenantFixture({ id: tenantId, rent: 10_000 }),
    expiresAbs: 99,
  });

  it("accepterar bästa ansökan för varje vakans i portföljen", () => {
    const a = makeProperty({
      id: 1, capacity: 3,
      tenants: [makeTenantFixture({ id: 50 })],
      applications: [app(900, 51), app(901, 52)],
    });
    const b = makeProperty({ id: 2, capacity: 2, tenants: [], applications: [app(902, 53)] });
    const bygger = makeProperty({ id: 3, capacity: 2, tenants: [], status: "bygger" });
    const s = reducer(makeState({ portfolio: [a, b, bygger] }), { type: "LEASE_ALL" });
    expect(s.portfolio[0].tenants).toHaveLength(3); // två ansökningar accepterade
    expect(s.portfolio[1].tenants).toHaveLength(1); // en ansökan fanns
    expect(s.portfolio[2].tenants).toHaveLength(0); // byggen rörs ej
    expect(s.log[0].t).toContain("3 ansökningar");
  });

  it("gör inget när inga ansökningar finns", () => {
    const vacant = makeProperty({ id: 1, capacity: 2, tenants: [], applications: [] });
    const s = reducer(makeState({ portfolio: [vacant] }), { type: "LEASE_ALL" });
    expect(s.portfolio[0].tenants).toHaveLength(0);
    expect(s.log[0].t).toContain("Inga ansökningar");
  });
});

describe("MAINTAIN_ALL", () => {
  it("underhåller fastigheter under tröskeln så långt kassan räcker", () => {
    const bad = makeProperty({ id: 1, condition: 30 });
    const ok = makeProperty({ id: 2, condition: 80 });
    const s = reducer(makeState({ cash: 100_000_000, portfolio: [bad, ok] }), {
      type: "MAINTAIN_ALL",
      threshold: 45,
    });
    expect(s.portfolio[0].condition).toBe(45); // 30 + 15
    expect(s.portfolio[1].condition).toBe(80); // över tröskeln – orörd
    expect(s.cash).toBeLessThan(100_000_000);
  });

  it("hoppar över det kassan inte räcker till", () => {
    const bad = makeProperty({ id: 1, condition: 30 });
    const s = reducer(makeState({ cash: 1000, portfolio: [bad] }), {
      type: "MAINTAIN_ALL",
      threshold: 45,
    });
    expect(s.portfolio[0].condition).toBe(30);
    expect(s.cash).toBe(1000);
  });
});

describe("RENEW_ALL", () => {
  it("förnyar kontrakt som löper ut inom fristen till marknadshyra", () => {
    const expiring = makeTenantFixture({ id: 1, monthsLeft: 2, rent: 5_000, termTotal: 24 });
    const longLease = makeTenantFixture({ id: 2, monthsLeft: 20, rent: 5_000 });
    const p = makeProperty({ id: 1, capacity: 2, tenants: [expiring, longLease] });
    const s = reducer(makeState({ portfolio: [p] }), { type: "RENEW_ALL", monthsLeft: 3 });
    const [t1, t2] = s.portfolio[0].tenants;
    expect(t1.monthsLeft).toBe(24); // förnyat
    expect(t1.rent).toBeGreaterThanOrEqual(5_000);
    expect(t2.monthsLeft).toBe(20); // orört
    expect(s.log[0].t).toContain("Förnyade 1");
  });
});

describe("MANAGE_ALL", () => {
  it("slår på förvaltare på alla färdiga fastigheter", () => {
    const a = makeProperty({ id: 1 });
    const b = makeProperty({ id: 2, managed: false });
    const s = reducer(makeState({ portfolio: [a, b] }), { type: "MANAGE_ALL", managed: true });
    expect(s.portfolio.every((p) => p.managed)).toBe(true);
  });
});
