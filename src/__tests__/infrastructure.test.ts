/* Infrastruktur 2.0: bestående tillgänglighet, medfinansiering och lobbying.
   Invigd infrastruktur ska lämna permanenta spår i distriktet – högre hyror,
   högre värden, större inflyttning – och spelaren ska kunna köpa sig in i
   byggprocessen (medfinansiera) eller starta den (lobba med politisk välvilja). */

import { describe, expect, it } from "vitest";
import {
  COFINANCE_SPEEDUP,
  INFRA_KINDS_2,
  accessRentMult,
  accessValueMult,
  accessibilityOf,
  cofinanceCost,
  infraKindById,
  lobbyCost,
  openInfra,
} from "../engine/infrastructure";
import { propMarketValue, propPotentialRent } from "../engine/property";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const abs = 0; // openedAbs spelar ingen roll för beräkningarna

describe("ACCESSIBILITY: invigd infrastruktur består", () => {
  it("utan infrastruktur är tillgängligheten exakt 1.0", () => {
    expect(accessibilityOf(makeState({}), "centrum")).toBe(1);
  });

  it("summerar bidrag med avtagande effekt (andra projektet ger 70 %)", () => {
    const s = makeState({
      infraBuilt: [
        { kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: abs },
        { kind: "sparvag", district: "centrum", access: 0.08, openedAbs: abs },
      ],
    });
    // 1 + 0.14 + 0.08×0.7 = 1.196
    expect(accessibilityOf(s, "centrum")).toBeCloseTo(1.196, 3);
    // Grannskapet påverkas inte.
    expect(accessibilityOf(s, "hamnen")).toBe(1);
  });

  it("hyres- och värdemultiplikatorerna kapitaliserar läget försiktigt", () => {
    const s = makeState({
      infraBuilt: [{ kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: abs }],
    });
    expect(accessRentMult(s, "centrum")).toBeCloseTo(1.07, 3); // halv effekt
    expect(accessValueMult(s, "centrum")).toBeCloseTo(1.056, 3); // 40 % effekt
  });

  it("syns i propPotentialRent och propMarketValue", () => {
    const p = makeProperty({ district: "centrum" });
    const before = makeState({});
    const after = makeState({
      infraBuilt: [{ kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: abs }],
    });
    expect(propPotentialRent(p, after)).toBeGreaterThan(propPotentialRent(p, before) * 1.05);
    expect(propMarketValue(p, after)).toBeGreaterThan(propMarketValue(p, before) * 1.04);
  });

  it("openInfra registrerar bestående tillgänglighet + dev-lyft", () => {
    const s = makeState({});
    const ev = openInfra(s, {
      name: "Metro line",
      district: "centrum",
      districtName: "Centrum",
      boost: 0.12,
      kindId: "tunnelbana",
    });
    expect(s.infraBuilt).toHaveLength(1);
    expect(s.infraBuilt![0]).toMatchObject({ kind: "tunnelbana", district: "centrum", access: 0.14 });
    expect(s.districtDev?.centrum).toBeCloseTo(1.12, 3);
    expect(ev.t).toContain("OPENED");
  });
});

describe("MEDFINANSIERING: 20 % av notan mot 25 % kortare byggtid", () => {
  const project = {
    id: 900,
    name: "Tram line",
    district: "centrum",
    districtName: "Centrum",
    monthsLeft: 24,
    totalMonths: 24,
    boost: 0.1,
    kindId: "sparvag",
  };

  it("kortar byggtiden, kostar 20 % av notan och ger anseende", () => {
    const cost = cofinanceCost("sparvag");
    expect(cost).toBe(Math.round(90_000_000 * 0.2));
    const s = makeState({ cash: cost + 1_000_000, infraProjects: [project] });
    const after = reducer(s, { type: "COFINANCE_INFRA", projectId: 900 });
    expect(after.cash).toBe(s.cash - cost);
    expect(after.reputation).toBe(52);
    const pr = after.infraProjects![0];
    expect(pr.monthsLeft).toBe(Math.round(24 * COFINANCE_SPEEDUP));
    expect(pr.cofinanced).toBe(true);
  });

  it("är ett engångserbjudande och kräver kassa", () => {
    const cost = cofinanceCost("sparvag");
    const s = makeState({ cash: cost * 3, infraProjects: [project] });
    const once = reducer(s, { type: "COFINANCE_INFRA", projectId: 900 });
    const twice = reducer(once, { type: "COFINANCE_INFRA", projectId: 900 });
    expect(twice.cash).toBe(once.cash); // andra försöket är ett nej
    const poor = makeState({ cash: 1_000, infraProjects: [project] });
    expect(reducer(poor, { type: "COFINANCE_INFRA", projectId: 900 }).infraProjects![0].cofinanced).toBeUndefined();
  });
});

describe("LOBBYING: politisk välvilja startar valfritt projekt", () => {
  const favor = { favorMonthsLeft: 12, favorParty: "borgerliga" };

  it("kräver politisk välvilja", () => {
    const s = makeState({ cash: 1_000_000_000 });
    const after = reducer(s, { type: "LOBBY_INFRA", kindId: "sparvag", district: "centrum" });
    expect(after.infraProjects ?? []).toHaveLength(0);
  });

  it("startar projektet, tar 25 % av notan och förbrukar välviljan", () => {
    const cost = lobbyCost("tunnelbana");
    expect(cost).toBe(Math.round(220_000_000 * 0.25));
    const s = makeState({ cash: cost + 5_000_000, politics: favor });
    const after = reducer(s, { type: "LOBBY_INFRA", kindId: "tunnelbana", district: "centrum" });
    expect(after.cash).toBe(s.cash - cost);
    expect(after.infraProjects).toHaveLength(1);
    expect(after.infraProjects![0]).toMatchObject({ kindId: "tunnelbana", district: "centrum", cofinanced: true });
    expect(after.politics?.favorMonthsLeft).toBe(0); // förbrukad
  });

  it("respekterar distriktskrav och en-i-taget-regeln", () => {
    const s = makeState({ cash: 1_000_000_000, politics: favor });
    // Hamnutbyggnad går bara i hamnen.
    const wrong = reducer(s, { type: "LOBBY_INFRA", kindId: "hamnutbyggnad", district: "centrum" });
    expect(wrong.infraProjects ?? []).toHaveLength(0);
    const right = reducer(s, { type: "LOBBY_INFRA", kindId: "hamnutbyggnad", district: "hamnen" });
    expect(right.infraProjects).toHaveLength(1);
    // Bygger kommunen redan är dörren stängd.
    const busy = reducer(right, {
      type: "LOBBY_INFRA",
      kindId: "sparvag",
      district: "centrum",
    });
    expect(busy.infraProjects).toHaveLength(1);
  });
});

describe("SIMULERINGEN: invigningen lyfter distriktet permanent", () => {
  it("ett färdigt projekt loggas och höjer accessibility", () => {
    seedRng(11);
    try {
      let s = makeState({
        infraProjects: [
          {
            id: 901,
            name: "Metro line",
            district: "centrum",
            districtName: "Centrum",
            monthsLeft: 1,
            totalMonths: 36,
            boost: 0.12,
            kindId: "tunnelbana",
          },
        ],
      });
      s = tick(s);
      expect((s.infraProjects ?? []).find((pr) => pr.id === 901)).toBeUndefined();
      expect(accessibilityOf(s, "centrum")).toBeCloseTo(1.14, 3);
      expect(s.log.some((e) => e.t.includes("OPENED"))).toBe(true);
    } finally {
      clearRng();
    }
  });

  it("alla projekttyper har konsistenta definitioner", () => {
    for (const k of INFRA_KINDS_2) {
      expect(k.access).toBeGreaterThan(0);
      expect(k.cost).toBeGreaterThan(0);
      expect(k.months[0]).toBeLessThanOrEqual(k.months[1]);
      expect(k.devBoost[0]).toBeLessThanOrEqual(k.devBoost[1]);
      expect(infraKindById(k.id)).toBe(k);
      expect(cofinanceCost(k.id)).toBeGreaterThan(0);
      expect(lobbyCost(k.id)).toBeGreaterThan(cofinanceCost(k.id));
    }
  });
});
