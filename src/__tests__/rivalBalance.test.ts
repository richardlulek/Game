import { describe, expect, it } from "vitest";
import { equityOf } from "../engine/finance";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { Competitor, GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* Vakt för rivalernas förmögenhetsmodell (användarrapport: "jag äger 300
   fastigheter, rivalen 30–50, men jag är ändå bara topp 4–5"):
   · Vanliga rivaler fick 6 %/år på portföljvärdet som REN kassa – inga
     kostnader, ingen utdelning – och komposterade kassaberg i decennier.
   · De institutionella fonderna spawnade med 90 % av spelarens equity och
     fylldes på till 40 % så fort de sjönk – de rankade per definition
     alltid över spelaren, oavsett innehav. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

function rival(name: string, props: number, cash = 5_000_000): Competitor {
  return {
    name,
    cash,
    units: props,
    equity: 0,
    strategy: "värde",
    portfolio: Array.from({ length: props }, (_, i) =>
      makeProperty({ id: 9000 + i, parcelId: undefined }),
    ),
  };
}

describe("RIVALBALANS: förmögenhet ska bo i husen, inte i osynliga kassaberg", () => {
  it("kapitaldisciplinen håller rivalkassan under ~40 % av eget kapital", () => {
    seedRng(3);
    try {
      let s: GameState = makeState({ competitors: [rival("Testbolaget", 30)], cash: 20_000_000 });
      for (let m = 0; m < 120; m++) s = tick(s);
      const c = s.competitors.find((x) => x.name === "Testbolaget")!;
      expect(c.cash, `kassa ${c.cash} vs equity ${c.equity}`).toBeLessThanOrEqual(
        Math.max(10_000_000, c.equity * 0.45),
      );
      expect(c.equity).toBeGreaterThan(0);
    } finally {
      clearRng();
    }
  });

  it("smälter ner ett gammalt kassaberg (befintliga sparfiler läker sig själva)", () => {
    seedRng(5);
    try {
      // 800 Msek kassa mot en liten portfölj – gamla spelets slutläge.
      let s: GameState = makeState({ competitors: [rival("Bergbolaget", 10, 800_000_000)], cash: 20_000_000 });
      for (let m = 0; m < 36; m++) s = tick(s);
      const c = s.competitors.find((x) => x.name === "Bergbolaget")!;
      // Efter 3 år ska merparten av berget vara utdelat eller investerat i hus.
      expect(c.cash).toBeLessThan(400_000_000);
    } finally {
      clearRng();
    }
  });

  it("fonderna är budkonkurrenter, inte permanenta rankingtoppar", () => {
    seedRng(9);
    try {
      // Spelare över fondtröskeln (400 Msek) → fonderna kliver in.
      let s: GameState = makeState({ cash: 500_000_000 });
      for (let m = 0; m < 24; m++) s = tick(s);
      const funds = s.competitors.filter((c) => c.institutional);
      expect(funds.length).toBeGreaterThan(0);
      const eq = equityOf(s);
      for (const f of funds) {
        // Krigskassa nog att bjuda – men ingen förmögenhetsgaranti på 90 %+.
        expect(f.cash, `${f.name} kassa ${f.cash} vs spelarens eq ${eq}`).toBeLessThan(eq * 0.55);
      }
    } finally {
      clearRng();
    }
  });
});
