import { afterEach, describe, expect, it, vi } from "vitest";
import { loanTerms } from "../engine/finance";
import { opexMult, spreadDelta, vacancyMult } from "../engine/progression";
import { propAnnualOpex } from "../engine/property";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState } from "./factories";

afterEach(() => vi.restoreAllMocks());

describe("globala modifierare", () => {
  it("förvaltningschef sänker driftkostnaden", () => {
    const p = makeProperty({ baseRent: 100_000 });
    const base = makeState();
    const withMgr = makeState({ staff: { forvaltning: 2 } });
    expect(opexMult(withMgr)).toBeCloseTo(0.92, 5);
    expect(propAnnualOpex(p, withMgr)).toBeLessThan(propAnnualOpex(p, base));
  });

  it("CFO och forskning sänker räntepåslaget", () => {
    const base = loanTerms(makeState({ reputation: 50 }));
    const withCfo = loanTerms(makeState({ reputation: 50, staff: { cfo: 2 } }));
    expect(spreadDelta(makeState({ staff: { cfo: 2 } }))).toBeCloseTo(0.3, 5);
    expect(withCfo.spread).toBeLessThan(base.spread);
  });

  it("forskning sänker vakans", () => {
    expect(vacancyMult(makeState({ researchDone: ["datauthyrning"] }))).toBeLessThan(1);
  });
});

describe("anställda (reducer)", () => {
  it("HIRE_STAFF höjer nivå och drar ingångsarvode", () => {
    const s = makeState({ cash: 1_000_000 });
    const next = reducer(s, { type: "HIRE_STAFF", role: "forvaltning" });
    expect(next.staff.forvaltning).toBe(1);
    expect(next.cash).toBe(1_000_000 - 24_000); // baseSalary * nivå 1
  });

  it("FIRE_STAFF nollställer rollen", () => {
    const s = makeState({ cash: 1e6, staff: { cfo: 2 } });
    const next = reducer(s, { type: "FIRE_STAFF", role: "cfo" });
    expect(next.staff.cfo).toBeUndefined();
  });
});

describe("ändra användning (reducer)", () => {
  it("byter typ och räknar om baseRent på en vakant fastighet", () => {
    const s = makeState({ cash: 50e6, portfolio: [makeProperty({ id: 1, type: "bostad", tenants: [] })] });
    const next = reducer(s, { type: "CHANGE_USE", id: 1, propType: "kontor" });
    expect(next.portfolio[0].type).toBe("kontor");
    expect(next.portfolio[0].typeLabel).toBe("Kontor");
  });

  it("blockeras om fastigheten har hyresgäster", () => {
    const s = makeState({
      cash: 50e6,
      portfolio: [makeProperty({ id: 1, type: "bostad", tenants: [{ id: 9, profile: "smb", name: "X", quality: 1, defaultRisk: 0.01, monthsLeft: 12, termTotal: 12, rent: 1000 }] })],
    });
    const next = reducer(s, { type: "CHANGE_USE", id: 1, propType: "kontor" });
    expect(next.portfolio[0].type).toBe("bostad");
  });
});

describe("forskning (reducer + simulation)", () => {
  it("START_RESEARCH drar budget och sätter aktivt projekt", () => {
    const s = makeState({ cash: 5e6 });
    const next = reducer(s, { type: "START_RESEARCH", id: "gron_energi" });
    expect(next.activeResearch?.id).toBe("gron_energi");
    expect(next.cash).toBe(5e6 - 1_500_000);
  });

  it("projektet blir klart när månaderna räknats ner", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const s = makeState({ activeResearch: { id: "gron_energi", monthsLeft: 1, monthsTotal: 6 } });
    const next = advanceMonth(s);
    expect(next.activeResearch).toBeNull();
    expect(next.researchDone).toContain("gron_energi");
  });
});
