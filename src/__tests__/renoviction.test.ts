/* Livscykel: renovräkning. Gamla, nedgångna bostadshus ställer ägaren
   inför totalrenoveringsbeslutet – hyresgästerna flyttar, skicket och
   åldern återställs, hyrespotentialen lyfter (halverat om kulturmärkt) –
   och hus över 40 år slits allt snabbare. */

import { describe, expect, it } from "vitest";
import { ageWearFactor } from "../engine/lifecycle";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState, PendingDecision } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function oldWreck(id = 8800) {
  return makeProperty({
    id,
    district: "centrum",
    type: "bostad",
    condition: 40,
    builtYear: -45, // spelår 1 ⇒ 46 år gammalt
    capacity: 4,
    tenants: [
      makeTenantFixture({ id: 8801, profile: "hushall", monthsLeft: 24 }),
      makeTenantFixture({ id: 8802, profile: "hushall", monthsLeft: 12 }),
    ],
  });
}

describe("ÅLDERSSLITAGE: hus över 40 accelererar", () => {
  it("+1 % per år över 40, tak ×1.6", () => {
    const s = makeState({});
    expect(ageWearFactor(makeProperty({ builtYear: 1 }), s)).toBe(1);
    expect(ageWearFactor(makeProperty({ builtYear: -39 }), s)).toBe(1); // exakt 40
    expect(ageWearFactor(makeProperty({ builtYear: -54 }), s)).toBeCloseTo(1.15, 3); // 55 år
    expect(ageWearFactor(makeProperty({ builtYear: -200 }), s)).toBe(1.6);
  });
});

describe("RENOVRÄKNINGSBESLUTET: gamla ruckel kräver besked", () => {
  it("dyker upp för ett gammalt nedgånget bostadshus och är engångs", () => {
    seedRng(3);
    try {
      let s = makeState({ cash: 100_000_000, portfolio: [oldWreck()] });
      s = tick(s);
      expect(s.pendingDecision?.id).toBe("renovate-8800");
      expect(s.portfolio[0].renovOffered).toBe(true);
      // Avböj – erbjudandet återkommer inte.
      s = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 1 });
      expect(s.pendingDecision).toBeNull();
      s = tick(s);
      expect(s.pendingDecision?.id).not.toBe("renovate-8800");
    } finally {
      clearRng();
    }
  });

  it("dyker inte upp för unga eller välskötta hus", () => {
    seedRng(3);
    try {
      const young = makeProperty({ id: 8810, type: "bostad", condition: 40, builtYear: 1, tenants: [makeTenantFixture({})] });
      const tended = makeProperty({ id: 8811, type: "bostad", condition: 80, builtYear: -45, tenants: [makeTenantFixture({})] });
      const s = tick(makeState({ portfolio: [young, tended] }));
      expect(s.pendingDecision?.id?.startsWith("renovate-")).not.toBe(true);
    } finally {
      clearRng();
    }
  });
});

describe("TOTALRENOVERINGEN: effekterna landar via RESOLVE_DECISION", () => {
  function decisionFor(heritage: boolean, cost: number): PendingDecision {
    return {
      id: "renovate-8800",
      title: "Total renovation?",
      text: "…",
      options: [
        {
          label: "Renovate",
          detail: "…",
          effect: {
            cash: -cost,
            reputation: -2,
            renovate: { propertyId: 8800, heritage },
            log: "🔨 RENOVICTION",
            logKind: "expense",
          },
        },
        { label: "Not now", detail: "…", effect: { log: "…", logKind: "info" } },
      ],
    };
  }

  it("tömmer huset, återställer skick/ålder och lyfter hyran – mot rykte och press", () => {
    const s = makeState({
      cash: 50_000_000,
      portfolio: [oldWreck()],
      pendingDecision: decisionFor(false, 10_000_000),
    });
    const after = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    const p = after.portfolio[0];
    expect(after.cash).toBe(40_000_000);
    expect(after.reputation).toBe(48);
    expect(after.pressHeat).toBe(3);
    expect(p.condition).toBe(95);
    expect(p.builtYear).toBe(after.year); // åldern nollställd
    expect(p.tenants).toHaveLength(0);
    expect(p.rentMult).toBeCloseTo(1.15, 3);
  });

  it("kulturmärkning halverar hyreslyftet", () => {
    const s = makeState({
      cash: 50_000_000,
      portfolio: [oldWreck()],
      pendingDecision: decisionFor(true, 10_000_000),
    });
    const after = reducer(s, { type: "RESOLVE_DECISION", optionIndex: 0 });
    expect(after.portfolio[0].rentMult).toBeCloseTo(1.075, 3);
  });
});
