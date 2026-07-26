/* Aktivistfonden får bara hota kontrollen när den FAKTISKT kan ta den.
   Buggen som testerna nedan låser: med 51 % ägande blev tröskeln 50 % medan
   fondens tak låg på floatens 49 %. Övertagandet var omöjligt, men spelaren
   fick ändå varningar och en beslutsmodal som krävde miljoner i återköp. */
import { describe, expect, it } from "vitest";
import { activistControl } from "../engine/stocks";
import { advanceMonth } from "../engine/simulation";
import { clearRng, seedRng } from "../engine/random";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

/** Noterat bolag där spelaren behåller `playerPct` av rösterna. */
function listed(playerPct: number, over: Partial<GameState> = {}): GameState {
  const total = 10_000_000;
  return makeState({
    ipoActive: true,
    ipoShares: { total, public: Math.round((total * (100 - playerPct)) / 100) },
    takeoverPressure: 0,
    ...over,
  }) as GameState;
}

describe("aktivistens möjlighet att ta kontrollen", () => {
  it("majoritet gör övertagandet omöjligt", () => {
    const c = activistControl(listed(51));
    expect(c.playerPct).toBeCloseTo(51, 6);
    expect(c.possible).toBe(false);
    expect(c.safeReason).toMatch(/51%/);
  });

  it("exakt 50 % räcker inte – då kan fonden nå lika många röster", () => {
    expect(activistControl(listed(50)).possible).toBe(true);
  });

  it("minoritet med tillräcklig float är ett verkligt hot", () => {
    const c = activistControl(listed(40));
    expect(c.possible).toBe(true);
    expect(c.threshold).toBeCloseTo(40, 6); // de vinner när de passerar dig
  });

  it("rivaler som sitter på floaten kan göra hotet omöjligt", () => {
    // Spelaren 45 %, float 55 % – men rivalerna äger 40 procentenheter av den,
    // så fonden kan som mest nå 15 %. Tröskeln är 45 %.
    const total = 10_000_000;
    const s = makeState({
      ipoActive: true,
      ipoShares: { total, public: total * 0.55 },
      competitors: [{
        name: "Coastline Ltd", cash: 0, units: 0, equity: 0, portfolio: [], strategy: "värde",
        stockHoldings: [{ stockId: "FBAB", shares: total * 0.4, avgCost: 10 }],
      }],
    }) as GameState;
    const c = activistControl(s);
    expect(c.ceilingPct).toBeCloseTo(15, 6);
    expect(c.possible).toBe(false);
    expect(c.safeReason).toMatch(/not enough/i);
  });

  it("med majoritet kommer varken varning, penningkrav eller förlust", () => {
    seedRng(7);
    try {
      // Fonden startar UNDER den gamla larmgränsen (44 %) och växer förbi
      // den: död kassa (>35 % av EK) och svag avkastning ger +2,5 pe/mån.
      // Utan skyddet slår varningen och penningkravet till på vägen upp.
      let s = listed(51, {
        takeoverPressure: 38,
        cash: 400_000_000,        // död kassa driver upp fonden
        reputation: 20,
        portfolio: [makeProperty({
          id: 1, baseRent: 2_000_000, capacity: 4,
          tenants: [makeTenantFixture({ id: 1, rent: 30_000 })],
        })],
        stocks: [{
          id: "FBAB", name: "Property Corp", sector: "fastighet", price: 100, prevPrice: 100,
          sharesOutstanding: 10_000_000, owned: 0, avgCost: 0, dividendYield: 0,
          beta: 1, drift: 0, volatility: 0.1, history: [100], competitorName: "__player__",
        }],
      });
      for (let m = 0; m < 36; m++) {
        s = advanceMonth({ ...s, pendingDecision: null, auction: undefined });
        expect(s.gameOver).toBeFalsy();
        const warned = s.log.some((e) => /Kronfelt Capital now owns|HOSTILE/i.test(e.t));
        expect(warned).toBe(false);
      }
      // Och inget beslut som kräver pengar för att försvara kontrollen.
      expect(s.pendingDecision?.id).not.toBe("hostile_takeover");
    } finally {
      clearRng();
    }
  });

  it("utan majoritet fungerar hotet fortfarande", () => {
    const c = activistControl(listed(35, { takeoverPressure: 30 }));
    expect(c.possible).toBe(true);
    expect(c.threshold).toBeCloseTo(35, 6);
    expect(c.ceilingPct).toBeGreaterThan(c.threshold);
  });
});
