/* Nemesis 2.0: personlighetsdriven aggression. Aggressionen styr budkrigens
   uthållighet och nemesisens frekvens; fientligheten har en trappa – motbud,
   värvning/svartmålning, och till sist en allians mot spelaren. Standing
   förfaller sakta mot neutralt så fejder kan svalna. */

import { describe, expect, it } from "vitest";
import { nextBidRound } from "../engine/lifecycle";
import { aggressionOf } from "../engine/rivalPersonas";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return { name, cash: 30_000_000, units: 0, equity: 120_000_000, portfolio: [], strategy: "värde", ...over };
}

describe("AGGRESSION: personligheten sitter i datat", () => {
  it("Harborwick är hajen, Sonny Lund byggaren, okända neutrala", () => {
    expect(aggressionOf("Harborview Capital")).toBe(0.9);
    expect(aggressionOf("Grovewood Properties")).toBe(0.3);
    expect(aggressionOf("Meridian Global Partners")).toBe(0.5);
  });

  it("aggressiva personor viker senare i budkrig", () => {
    const folds = (aggression: number): number => {
      seedRng(53);
      try {
        let n = 0;
        for (let i = 0; i < 300; i++) if (nextBidRound(10_000_000, 1, aggression).fold) n++;
        return n;
      } finally {
        clearRng();
      }
    };
    expect(folds(0.9)).toBeLessThan(folds(0.3) * 0.75);
  });
});

describe("ESKALERINGSTRAPPAN: fientligheten har nivåer", () => {
  it("nivå 2 (standing ≤ −60): värvning eller svartmålning drabbar dig", () => {
    seedRng(59);
    try {
      let s = makeState({
        competitors: [rival("Harborview Capital")],
        standing: { rivals: { "Harborview Capital": -90 } },
        portfolio: [
          makeProperty({
            id: 9950,
            capacity: 4,
            tenants: [1, 2, 3].map((n) => makeTenantFixture({ id: 9950 + n })),
          }),
        ],
        reputation: 60,
      });
      let hit = false;
      for (let m = 0; m < 60 && !hit; m++) {
        s = tick(s);
        hit = s.log.some((e) => e.t.includes("poaches your tenant") || e.t.includes("smear piece"));
      }
      expect(hit).toBe(true);
    } finally {
      clearRng();
    }
  }, 60_000);

  it("nivå 3 (standing ≤ −80): nemesisen samlar staden mot dig", () => {
    seedRng(61);
    try {
      // Tre rivaler: även om slumpens relationsblock hinner para ihop två av
      // dem först finns alltid en partner kvar för eskaleringens allians.
      let s = makeState({
        competitors: [
          rival("Harborview Capital"),
          rival("Northgate Properties", { equity: 300_000_000 }),
          rival("Sterling & Partners", { equity: 200_000_000 }),
        ],
        standing: { rivals: { "Harborview Capital": -95 } },
      });
      let turned = false;
      for (let m = 0; m < 60 && !turned; m++) {
        s = tick(s);
        turned = s.log.some((e) => e.t.includes("THE CITY TURNS"));
      }
      expect(turned).toBe(true);
      expect(
        (s.rivalRelations ?? []).some(
          (r) => r.kind === "alliance" && (r.a === "Harborview Capital" || r.b === "Harborview Capital"),
        ),
      ).toBe(true);
    } finally {
      clearRng();
    }
  }, 60_000);

  it("standing förfaller sakta mot neutralt", () => {
    seedRng(67);
    try {
      let s = makeState({
        competitors: [rival("Grovewood Properties")],
        standing: { rivals: { "Grovewood Properties": 10, "Wellspring Invest": -0.2 } },
      });
      s = tick(s);
      expect(s.standing?.rivals?.["Grovewood Properties"]).toBeCloseTo(9.7, 1);
      // Nästan-neutrala relationer nollas helt (städas ur kartan).
      expect(s.standing?.rivals?.["Wellspring Invest"]).toBeUndefined();
    } finally {
      clearRng();
    }
  });
});
