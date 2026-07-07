/* Tester för bolagsresan: nivåkrav, upplåsningar och nivåhöjning. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPANY_NAME,
  MAX_LEVEL,
  TIERS,
  computedLevel,
  nextTier,
  tierForLevel,
  unlockLevelFor,
  unlockedWindows,
} from "../engine/company";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const props = (n: number) =>
  Array.from({ length: n }, (_, i) => makeProperty({ id: i + 1, askPrice: 1_000_000 }));

describe("bolagsnivåer", () => {
  it("startnivån låser upp grundfönstren men inte Bygg/Börs/Industri", () => {
    const w = unlockedWindows(1);
    for (const id of ["company", "portfolio", "market", "finance", "tenants", "log"])
      expect(w.has(id)).toBe(true);
    for (const id of ["build", "stocks", "staff", "acquisition", "industri"])
      expect(w.has(id)).toBe(false);
  });

  it("upplåsningarna är kumulativa och unlockLevelFor pekar rätt", () => {
    const w4 = unlockedWindows(4);
    expect(w4.has("build")).toBe(true); // nivå 2
    expect(w4.has("staff")).toBe(true); // nivå 3
    expect(w4.has("stocks")).toBe(true); // nivå 4
    expect(w4.has("industri")).toBe(false); // nivå 5
    expect(unlockLevelFor("stocks")).toBe(4);
    expect(unlockLevelFor("industri")).toBe(5);
    expect(unlockLevelFor("portfolio")).toBe(1);
  });

  it("computedLevel kräver både kapital och fastigheter", () => {
    // Mycket kassa men inga hus → fastighetskravet stoppar
    expect(computedLevel(makeState({ cash: 100_000_000 }))).toBe(1);
    // Kassa + hus → nivå efter kraven
    const s = makeState({ cash: 30_000_000, portfolio: props(5) });
    expect(computedLevel(s)).toBeGreaterThanOrEqual(3);
  });

  it("högsta nivån kräver börsnotering", () => {
    const rich = makeState({ cash: 500_000_000, portfolio: props(20) });
    expect(computedLevel(rich)).toBe(MAX_LEVEL - 1);
    expect(computedLevel({ ...rich, ipoActive: true })).toBe(MAX_LEVEL);
  });
});

describe("nivåhöjning i simulationen", () => {
  it("höjer en nivå i taget och loggar händelsen", () => {
    const s0 = makeState({
      cash: 50_000_000,
      portfolio: props(6),
      companyLevel: 1,
      companyName: "Test AB",
    });
    const s1 = advanceMonth(s0);
    expect(s1.companyLevel).toBe(2); // ett steg per månad, inte hopp
    expect(s1.log.some((l) => l.t.includes("BOLAGET VÄXER"))).toBe(true);
    const s2 = advanceMonth(s1);
    expect(s2.companyLevel).toBe(3);
  });

  it("nivån sjunker aldrig även om kapitalet rasar", () => {
    const s0 = makeState({ cash: 1_000, portfolio: [], companyLevel: 4 });
    const s1 = advanceMonth(s0);
    expect(s1.companyLevel).toBe(4);
  });
});

describe("bolagsnamn", () => {
  it("RESET tar emot bolagsnamn och SET_COMPANY_NAME byter det", () => {
    const fresh = reducer(makeState({}), {
      type: "RESET",
      scenarioId: "sandbox",
      companyName: "Lulek Fastigheter AB",
    });
    expect(fresh.companyName).toBe("Lulek Fastigheter AB");
    expect(fresh.companyLevel).toBe(1);

    const renamed = reducer(fresh, { type: "SET_COMPANY_NAME", name: "  Nya Namnet  " });
    expect(renamed.companyName).toBe("Nya Namnet");
    // Tomt namn ignoreras
    expect(reducer(renamed, { type: "SET_COMPANY_NAME", name: "   " }).companyName).toBe("Nya Namnet");
  });

  it("initState har standardnamn och nivå 1", () => {
    const fresh = reducer(makeState({}), { type: "RESET" });
    expect(fresh.companyName).toBe(DEFAULT_COMPANY_NAME);
    expect(fresh.companyLevel).toBe(1);
  });
});

describe("tier-definitioner", () => {
  it("nivåerna är stigande i både kapital och fastigheter", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].minEquity).toBeGreaterThan(TIERS[i - 1].minEquity);
      expect(TIERS[i].minUnits).toBeGreaterThanOrEqual(TIERS[i - 1].minUnits);
      expect(TIERS[i].level).toBe(TIERS[i - 1].level + 1);
    }
    expect(tierForLevel(99).level).toBe(1); // okänd nivå faller tillbaka
    expect(nextTier(MAX_LEVEL)).toBeNull();
  });
});
