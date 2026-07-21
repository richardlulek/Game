/* Scenariopaketet (fas 4): tre nya mål byggda på de nya systemen –
   spårnära lägen (infrastruktur 2.0), institutionsimperiet (bank +
   försäkring) och den stora konsolideringen (M&A + räntechocker). */

import { describe, expect, it } from "vitest";
import { SCENARIOS, rivalScenarioProgress, rivalWinsScenario } from "../engine/scenarios";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

const byId = (id: string) => SCENARIOS.find((sc) => sc.id === id)!;

function rival(name: string, over: Partial<Competitor> = {}): Competitor {
  return { name, cash: 20_000_000, units: 0, equity: 80_000_000, portfolio: [], strategy: "värde", ...over };
}

const metro = { kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: 0 };

describe("THE TRANSIT TYCOON: spårnära innehav räknas", () => {
  it("kräver tio färdiga hus i distrikt med accessibility ≥ 1.05", () => {
    const sc = byId("infraMagnat");
    const houses = (district: string) =>
      Array.from({ length: 10 }, (_, i) => makeProperty({ id: 9000 + i, district }));
    const connected = makeState({ infraBuilt: [metro], portfolio: houses("centrum") });
    const remote = makeState({ infraBuilt: [metro], portfolio: houses("hamnen") });
    expect(sc.check(connected)).toBe(true);
    expect(sc.check(remote)).toBe(false);
    expect(sc.progress(remote).value).toBe(0);
    expect(sc.progress(connected).value).toBe(10);
  });

  it("rivalerna tävlar om samma spårnära lägen", () => {
    const s = makeState({ infraBuilt: [metro] });
    const r = rival("Northgate Properties", {
      portfolio: Array.from({ length: 10 }, (_, i) => makeProperty({ id: 9100 + i, district: "centrum" })),
    });
    expect(rivalScenarioProgress(r, "infraMagnat", s)).toBe(1);
    expect(rivalWinsScenario(r, "infraMagnat", s)).toBe(true);
    expect(rivalWinsScenario(rival("Tomhänt AB"), "infraMagnat", s)).toBe(false);
  });
});

describe("THE FINANCIER: institutionsimperiet", () => {
  it("kräver både bank och försäkringsbolag samt 60M i samlat resultat", () => {
    const sc = byId("bankir");
    const bank = { name: "B", deposits: 0, loansOut: 0, stance: "balanserad" as const, acquiredAbs: 0, totalNet: 40_000_000 };
    const insurer = { name: "F", policies: 0, pricing: "marknad" as const, acquiredAbs: 0, totalNet: 25_000_000 };
    expect(sc.check(makeState({ ownedBank: bank, ownedInsurer: insurer }))).toBe(true);
    // Bara banken räcker inte, oavsett resultat.
    expect(sc.check(makeState({ ownedBank: { ...bank, totalNet: 90_000_000 } }))).toBe(false);
    expect(sc.progress(makeState({ ownedBank: bank })).value).toBe(40_000_000);
  });
});

describe("THE LAST EMPIRES: den stora konsolideringen", () => {
  it("kräver högst fyra kvarvarande rivaler och 100M i eget kapital", () => {
    const sc = byId("konsolidator");
    const four = ["A", "B", "C", "D"].map((n) => rival(n));
    expect(sc.check(makeState({ cash: 120_000_000, competitors: four }))).toBe(true);
    expect(sc.check(makeState({ cash: 120_000_000, competitors: [...four, rival("E")] }))).toBe(false);
    expect(sc.check(makeState({ cash: 20_000_000, competitors: four }))).toBe(false);
  });

  it("simuleringen flaggar vinsten", () => {
    seedRng(97);
    try {
      let s: GameState = makeState({
        scenarioId: "konsolidator",
        cash: 150_000_000,
        competitors: ["A", "B", "C"].map((n) => rival(n)),
      });
      s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
      expect(s.gameWon).toBe(true);
    } finally {
      clearRng();
    }
  });
});
