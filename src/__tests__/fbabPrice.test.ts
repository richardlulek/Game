import { describe, expect, it } from "vitest";
import { equityOf } from "../engine/finance";
import { clearRng, seedRng } from "../engine/random";
import { advanceDay } from "../engine/simulation";
import type { GameState, Stock } from "../engine/types";
import { makeState } from "./factories";

/* Användarrapport: bolag med enorma tillgångar handlades till $1 och spelet
   larmade om kurskollaps. Roten: priceStocks slumpvandring satte FBAB:s
   targetPrice, dagssteget drog kursen dit (15 %/dag) och kursen tappade
   kontakten med eget kapital – tills $1-golvet nåddes. Vakten här startar
   från det trasiga läget och kräver att kursen läker till fundamenta. */

function brokenFbab(price: number): Stock {
  return {
    id: "FBAB",
    name: "Property Corp (your company)",
    sector: "fastighet",
    price,
    prevPrice: price,
    targetPrice: price, // det trasiga ankaret från gamla slumpvandringen
    sharesOutstanding: 10_000_000,
    owned: 0,
    avgCost: 0,
    dividendYield: 0.025,
    beta: 1.2,
    drift: 0.001,
    volatility: 0.045,
    history: [price],
    competitorName: "__player__",
  };
}

describe("FBAB-KURSEN: följer eget kapital per aktie, inte en slumpvandring", () => {
  it("läker en $1-kurs till fundamenta vid nästa månadsskifte", () => {
    seedRng(7);
    try {
      let s: GameState = makeState({
        cash: 5_000_000_000_000, // 5 000 miljarder
        ipoActive: true,
        ipoShares: { total: 10_000_000, public: 4_900_000 },
        ipoPrice: 3,
        stocks: [brokenFbab(1)],
        day: 1,
      });
      // Kör dagar genom ett månadsskifte + en bit in i nästa månad.
      for (let d = 0; d < 45; d++)
        s = advanceDay({ ...s, pendingDecision: null, auction: undefined });
      const fbab = s.stocks.find((st) => st.id === "FBAB")!;
      const fair = equityOf(s) / s.ipoShares!.total; // ≈ 500 000 $/aktie
      expect(fair).toBeGreaterThan(100_000);
      // Kursen ska ligga vid fundamenta (dagsbruset är ±någon procent) –
      // inte på $1-golvet.
      expect(fbab.price).toBeGreaterThan(fair * 0.7);
      expect(fbab.price).toBeLessThan(fair * 1.3);
      // Och ankaret ska vara satt så dagssteget inte drar iväg kursen igen.
      expect(fbab.targetPrice).toBeGreaterThan(fair * 0.7);
    } finally {
      clearRng();
    }
  });

  it("kursen håller kontakten med fundamenta över ett kvartal av dagar", () => {
    seedRng(11);
    try {
      let s: GameState = makeState({
        cash: 100_000_000,
        ipoActive: true,
        ipoShares: { total: 10_000_000, public: 3_000_000 },
        ipoPrice: 10,
        stocks: [brokenFbab(10)],
        day: 1,
      });
      for (let d = 0; d < 95; d++) {
        s = advanceDay({ ...s, pendingDecision: null, auction: undefined });
        const fbab = s.stocks.find((st) => st.id === "FBAB")!;
        const fair = equityOf(s) / s.ipoShares!.total;
        // Aldrig mer än ±35 % från eget kapital per aktie (efter första
        // månadsskiftet – innan dess kan startvärdet ligga fel).
        if (d > 32) {
          expect(fbab.price).toBeGreaterThan(fair * 0.65);
          expect(fbab.price).toBeLessThan(fair * 1.35);
        }
      }
    } finally {
      clearRng();
    }
  });
});
