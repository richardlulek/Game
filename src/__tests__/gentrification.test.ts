/* Gentrifiering: tillgänglighet + beståndets standard driver en långsam
   månatlig drift i områdesutvecklingen. Utan infrastruktur ska driften
   vara begränsad (< +0.10 per decennium även med toppstandard); med
   tunnelbana gentrifieras distriktet på riktigt – och protester kan
   bryta ut där lågprisstocken är stor. */

import { describe, expect, it } from "vitest";
import { gentrificationDrift } from "../engine/infrastructure";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("DRIFTFORMELN: begränsad utan infrastruktur", () => {
  it("utan infrastruktur är ett decennium < +0.10 även med toppstandard", () => {
    // access 1.0, standard 1.0 → 0.0015 × 0.5 = 0.00075/mån → 0.09/decennium.
    expect(gentrificationDrift(1, 1) * 120).toBeLessThan(0.1);
    expect(gentrificationDrift(1, 1)).toBeGreaterThan(0);
  });

  it("neutral standard utan infrastruktur ger noll drift", () => {
    expect(gentrificationDrift(1, 0.5)).toBe(0);
  });

  it("driften är differentiell: stadssnittet är referensen, inte 0.5", () => {
    // Ett bra bestånd i en stad där ALLA håller samma standard är ingen
    // gentrifiering – annars inflaterar hela staden till Exklusivt.
    expect(gentrificationDrift(1, 0.8, 0.8)).toBe(0);
    expect(gentrificationDrift(1, 0.6, 0.8)).toBeLessThan(0);
    expect(gentrificationDrift(1, 0.8, 0.6)).toBeGreaterThan(0);
  });

  it("låg standard drar nedåt, tunnelbana dominerar uppåt", () => {
    expect(gentrificationDrift(1, 0.3)).toBeLessThan(0);
    // Metro (access 1.14): (0.14×4 − 0.2) × 0.0015 > 0 trots låg standard.
    expect(gentrificationDrift(1.14, 0.3)).toBeGreaterThan(0);
    expect(gentrificationDrift(1.14, 0.8)).toBeGreaterThan(gentrificationDrift(1, 0.8) * 2.5);
  });
});

describe("SIMULERINGEN: distrikt med infrastruktur gentrifieras", () => {
  it("tunnelbanedistriktet drar ifrån ett identiskt distrikt utan", () => {
    seedRng(13);
    try {
      const houses = (district: string, base: number) =>
        Array.from({ length: 3 }, (_, i) =>
          makeProperty({ id: base + i, district, type: "bostad", condition: 85, energyClass: "B" as const, tenants: [] }),
        );
      let s = makeState({
        cash: 80_000_000,
        portfolio: [...houses("centrum", 9700), ...houses("hamnen", 9710)],
        infraBuilt: [{ kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: 0 }],
        districtDev: { centrum: 1, hamnen: 1 },
      });
      const dev0 = { c: s.districtDev!.centrum, h: s.districtDev!.hamnen };
      for (let m = 0; m < 24; m++) s = tick(s);
      const gapC = (s.districtDev?.centrum ?? 1) - dev0.c;
      const gapH = (s.districtDev?.hamnen ?? 1) - dev0.h;
      // Båda kan röra sig av händelser, men infra-distriktet ska driva ifrån.
      expect(gapC).toBeGreaterThan(gapH);
    } finally {
      clearRng();
    }
  });
});
