/* Tester för bolagsresan: nivåkrav, upplåsningar och nivåhöjning. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COMPANY_NAME,
  MAX_LEVEL,
  OVERLOAD_COST_PER_PROP,
  TIERS,
  computedLevel,
  nextTier,
  orgLoadOf,
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

  it("Börsen låses upp på nivå 2 men förvärv/koncern först på nivå 4", () => {
    const w2 = unlockedWindows(2);
    expect(w2.has("stocks")).toBe(true); // börsen tidigt tillgänglig
    expect(w2.has("acquisition")).toBe(false); // förvärv kvar på nivå 4
    expect(w2.has("group")).toBe(false);
  });

  it("upplåsningarna är kumulativa och unlockLevelFor pekar rätt", () => {
    const w4 = unlockedWindows(4);
    expect(w4.has("build")).toBe(true); // nivå 2
    expect(w4.has("stocks")).toBe(true); // nivå 2
    expect(w4.has("staff")).toBe(true); // nivå 3
    expect(w4.has("acquisition")).toBe(true); // nivå 4
    expect(w4.has("industri")).toBe(false); // nivå 5
    expect(unlockLevelFor("stocks")).toBe(2);
    expect(unlockLevelFor("acquisition")).toBe(4);
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

describe("expansion är ett aktivt val", () => {
  it("simulationen höjer INTE nivån utan loggar en hint (en gång)", () => {
    const s0 = makeState({
      cash: 50_000_000,
      portfolio: props(6),
      companyLevel: 1,
      companyName: "Test AB",
    });
    const s1 = advanceMonth(s0);
    expect(s1.companyLevel).toBe(1);
    expect(s1.log.some((l) => l.t.includes("uppfyller kraven"))).toBe(true);
    // Hinten upprepas inte nästa månad
    const s2 = advanceMonth({ ...s1, log: [] });
    expect(s2.log.some((l) => l.t.includes("uppfyller kraven"))).toBe(false);
  });

  it("UPGRADE_COMPANY höjer nivån, drar kostnaden och ger reputation", () => {
    const s0 = makeState({ cash: 50_000_000, portfolio: props(6), companyLevel: 1 });
    const s1 = reducer(s0, { type: "UPGRADE_COMPANY" });
    expect(s1.companyLevel).toBe(2);
    expect(s1.cash).toBe(50_000_000 - tierForLevel(2).upgradeCost);
    expect(s1.reputation).toBe(54);
    expect(s1.log[0].t).toContain("EXPANSION");
  });

  it("UPGRADE_COMPANY vägrar utan uppfyllda krav eller kassa", () => {
    // Krav ej uppfyllda
    const poor = reducer(makeState({ cash: 50_000_000, companyLevel: 1 }), {
      type: "UPGRADE_COMPANY",
    });
    expect(poor.companyLevel).toBe(1);
    // Kraven uppfyllda men kassan för liten för expansionskostnaden
    const broke = reducer(
      makeState({ cash: 100_000, portfolio: props(30), companyLevel: 2 }),
      { type: "UPGRADE_COMPANY" },
    );
    expect(broke.companyLevel).toBe(2);
    expect(broke.log[0].t).toContain("Expansionen kostar");
  });

  it("nivån sjunker aldrig även om kapitalet rasar", () => {
    const s0 = makeState({ cash: 1_000, portfolio: [], companyLevel: 4 });
    const s1 = advanceMonth(s0);
    expect(s1.companyLevel).toBe(4);
  });
});

describe("kontorskostnad och överbelastning", () => {
  it("orgLoadOf räknar självförvaltade mot kapaciteten", () => {
    const mixed = [
      ...props(4),
      makeProperty({ id: 90, managed: true }),
      makeProperty({ id: 91, status: "bygger" }),
    ];
    const load = orgLoadOf(makeState({ portfolio: mixed, companyLevel: 1 }));
    expect(load.selfManaged).toBe(4); // förvaltade + byggen räknas inte
    expect(load.cap).toBe(3);
    expect(load.over).toBe(1);
    // Portföljdirektören täcker allt
    const gm = orgLoadOf(
      makeState({ portfolio: mixed, companyLevel: 1, globalManager: { active: true, minCondition: 45, rentTargetPct: 1, minTenantQuality: 0 } }),
    );
    expect(gm.over).toBe(0);
  });

  it("överbelastning kostar pengar varje månad", () => {
    // Samma portfölj (5 hus) på nivå 1 (kapacitet 3) respektive nivå 2
    // (kapacitet 6): enda kassaflödesskillnaden är 2 × överbelastningsavgift
    // mot nivå 2:s kontorskostnad.
    const mk = (companyLevel: number) =>
      makeState({ cash: 10_000_000, portfolio: props(5), companyLevel });
    const diff = advanceMonth(mk(2)).cash - advanceMonth(mk(1)).cash;
    expect(diff).toBe(2 * OVERLOAD_COST_PER_PROP - tierForLevel(2).monthlyOverhead);
    const s1 = advanceMonth({ ...mk(1), month: 3 }); // månad 3 → varningslogg
    expect(s1.log.some((l) => l.t.includes("överbelastad"))).toBe(true);
  });

  it("kontorskostnaden dras på högre nivåer", () => {
    const s0 = makeState({ cash: 10_000_000, companyLevel: 3, month: 3 });
    const s1 = advanceMonth(s0);
    expect(s1.log.some((l) => l.t.includes("Kontorskostnad"))).toBe(true);
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
