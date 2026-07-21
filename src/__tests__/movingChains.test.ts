/* Flyttkedjor: nya bostäder suger uppåt. En färdigställd nyproduktion
   ska få hushåll i äldre hus med lägre standard att flytta upp i kedjan,
   och hus vars standard inte matchar distriktets status ska tappa sökande. */

import { describe, expect, it } from "vitest";
import { applicationRate, propertyStandard } from "../engine/leasing";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { GameState, Property } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("PROPERTYSTANDARD: skick + energiklass + utvecklingsnivå", () => {
  it("nybyggt A-klassat hus ligger högt, gammalt ruckel lågt", () => {
    const fresh = makeProperty({ condition: 100, energyClass: "A", devLevel: 3 });
    const wreck = makeProperty({ condition: 30, energyClass: "F", devLevel: 0 });
    expect(propertyStandard(fresh)).toBeGreaterThan(0.95);
    expect(propertyStandard(wreck)).toBeLessThan(0.3);
    expect(propertyStandard(makeProperty({}))).toBeGreaterThan(propertyStandard(wreck));
  });
});

describe("STANDARDMATCHNING: fel standard för läget ger färre sökande", () => {
  const season = 1;

  it("ruckel i exklusivt distrikt tappar sökande mot samma hus i stabilt", () => {
    const rate = (dev: number): number => {
      const st = makeState({ districtDev: { centrum: dev } });
      const wreck: Property = makeProperty({
        district: "centrum", type: "bostad", condition: 35, energyClass: "F", capacity: 4, tenants: [],
      });
      return applicationRate(wreck, st, season);
    };
    // Samma hus, samma distrikt – bara tiern skiljer. Exklusivt (1.35) har
    // tiermult 1.25; mismatchen drar kvoten till 1.25×0.85 i stället för 1.25.
    expect(rate(1.35) / rate(1.0)).toBeCloseTo(1.25 * 0.85, 2);
  });

  it("lyxhus i eftersatt distrikt straffas också", () => {
    const lux = (dev: number): number => {
      const st = makeState({ districtDev: { centrum: dev } });
      const p = makeProperty({ district: "centrum", type: "bostad", condition: 100, energyClass: "A", devLevel: 3, capacity: 4, tenants: [] });
      return applicationRate(p, st, season);
    };
    // Eftersatt (0.8) har tiermult 0.75; med mismatch 0.75×0.85.
    expect(lux(0.8) / lux(1.0)).toBeCloseTo(0.75 * 0.85, 2);
  });
});

describe("FLYTTKEDJEPULSEN: färdig nyproduktion tömmer gamla ruckel", () => {
  it("hushåll lämnar äldre hus med låg standard när nybygget öppnar", () => {
    seedRng(7);
    try {
      // Nyproduktion som blir klar denna månad + sex gamla ruckel med hyresgäster.
      const newBuild = makeProperty({
        id: 9500, district: "centrum", type: "bostad", status: "bygger", buildLeft: 1,
        condition: 100, energyClass: "A", tenants: [], capacity: 4,
      });
      const wrecks = Array.from({ length: 6 }, (_, i) =>
        makeProperty({
          id: 9510 + i, district: "centrum", type: "bostad", condition: 30, energyClass: "F",
          capacity: 4,
          tenants: [1, 2, 3].map((n) => makeTenantFixture({ id: 9600 + i * 10 + n, profile: "hushall", monthsLeft: 24 })),
        }),
      );
      let s = makeState({ cash: 50_000_000, portfolio: [newBuild, ...wrecks] });
      const before = s.portfolio.reduce((a, p) => a + p.tenants.length, 0);
      s = tick(s);
      expect(s.portfolio.find((p) => p.id === 9500)?.status).toBe("klar");
      expect(s.log.some((e) => e.t.includes("Moving chain"))).toBe(true);
      const after = s.portfolio
        .filter((p) => p.id >= 9510)
        .reduce((a, p) => a + p.tenants.length, 0);
      expect(after).toBeLessThan(before);
    } finally {
      clearRng();
    }
  });

  it("ingen puls utan färdigställd nyproduktion", () => {
    seedRng(7);
    try {
      const wreck = makeProperty({
        id: 9520, district: "centrum", type: "bostad", condition: 30, energyClass: "F", capacity: 4,
        tenants: [makeTenantFixture({ id: 9601, profile: "hushall", monthsLeft: 24 })],
      });
      let s = makeState({ cash: 50_000_000, portfolio: [wreck] });
      s = tick(s);
      expect(s.log.some((e) => e.t.includes("Moving chain"))).toBe(false);
    } finally {
      clearRng();
    }
  });
});
