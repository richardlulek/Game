/* Ägarkartan: vem äger vem och hur mycket. Korsägandet byggs av
   rivalShareTrading; det här skyddar sammanställningen som UI:t visar –
   andelar måste summera till 100 % och posterna hamna hos rätt ägare. */
import { describe, expect, it } from "vitest";
import { holdingsOfOwner, ownershipMap, ownershipOf } from "../engine/stocks";
import { makeState } from "./factories";
import type { Competitor, GameState, Stock } from "../engine/types";

function stock(over: Partial<Stock> = {}): Stock {
  return {
    id: "RIV1", name: "Northgate Properties", sector: "fastighet",
    price: 100, prevPrice: 100, sharesOutstanding: 1_000_000,
    owned: 0, avgCost: 0, dividendYield: 0.03, beta: 1, drift: 0,
    volatility: 0.1, history: [100], competitorName: "Northgate Properties",
    ...over,
  };
}

function rival(name: string, holdings: { stockId: string; shares: number }[] = []): Competitor {
  return {
    name, cash: 10_000_000, units: 0, equity: 50_000_000,
    portfolio: [], strategy: "värde",
    stockHoldings: holdings.map((h) => ({ ...h, avgCost: 100 })),
  };
}

const sum = (o: { stakes: { share: number }[] }) => o.stakes.reduce((a, x) => a + x.share, 0);

describe("ägarkartan", () => {
  it("andelarna summerar till 100 % och resten ligger hos marknaden", () => {
    const st = stock();
    const s = makeState({
      stocks: [st],
      competitors: [rival("Coastline Ltd", [{ stockId: "RIV1", shares: 200_000 }])],
    }) as GameState;
    const o = ownershipOf(s, st);
    expect(sum(o)).toBeCloseTo(1, 6);
    const coast = o.stakes.find((x) => x.owner === "Coastline Ltd")!;
    expect(coast.share).toBeCloseTo(0.2, 6);
    expect(coast.value).toBe(200_000 * 100);
    expect(o.stakes.find((x) => x.owner === "Market")!.share).toBeCloseTo(0.8, 6);
  });

  it("räknar spelarens innehav i en rival", () => {
    const st = stock({ owned: 50_000 });
    const s = makeState({ stocks: [st], competitors: [] }) as GameState;
    const o = ownershipOf(s, st);
    expect(o.stakes.find((x) => x.owner === "You")!.share).toBeCloseTo(0.05, 6);
    expect(sum(o)).toBeCloseTo(1, 6);
  });

  it("flera rivaler i samma bolag listas störst först", () => {
    const st = stock();
    const s = makeState({
      stocks: [st],
      competitors: [
        rival("Liten AB", [{ stockId: "RIV1", shares: 50_000 }]),
        rival("Stor AB", [{ stockId: "RIV1", shares: 300_000 }]),
      ],
    }) as GameState;
    const o = ownershipOf(s, st);
    const rivals = o.stakes.filter((x) => x.kind === "rival");
    expect(rivals[0].owner).toBe("Stor AB");
    expect(rivals[1].owner).toBe("Liten AB");
    expect(sum(o)).toBeCloseTo(1, 6);
  });

  it("spelarens egna bolag: egen post, aktivist och rivaler mot floaten", () => {
    const fbab = stock({ id: "FBAB", name: "Ditt bolag", competitorName: "__player__" });
    const s = makeState({
      stocks: [fbab],
      ipoActive: true,
      ipoShares: { total: 1_000_000, public: 400_000 },
      takeoverPressure: 8, // aktivisten äger 8 %
      competitors: [rival("Harborview Capital", [{ stockId: "FBAB", shares: 100_000 }])],
    }) as GameState;
    const o = ownershipOf(s, fbab);
    expect(o.isPlayer).toBe(true);
    // Spelaren behåller totalen minus floaten.
    expect(o.stakes.find((x) => x.owner === "You")!.share).toBeCloseTo(0.6, 6);
    expect(o.stakes.find((x) => x.owner === "Kronfelt Capital")!.share).toBeCloseTo(0.08, 6);
    expect(o.stakes.find((x) => x.owner === "Harborview Capital")!.share).toBeCloseTo(0.1, 6);
    expect(sum(o)).toBeCloseTo(1, 6);
  });

  it("visar inte spelarens onoterade bolag i kartan", () => {
    const fbab = stock({ id: "FBAB", name: "Ditt bolag" });
    const s = makeState({ stocks: [fbab, stock()], ipoActive: false }) as GameState;
    expect(ownershipMap(s).map((o) => o.stockId)).not.toContain("FBAB");
  });

  it("visar också åt andra hållet: vad ett bolag äger i andra", () => {
    const a = stock({ id: "A", name: "A AB", sharesOutstanding: 1_000_000, price: 50 });
    const b = stock({ id: "B", name: "B AB", sharesOutstanding: 500_000, price: 200 });
    const s = makeState({
      stocks: [a, b],
      competitors: [rival("Korsägaren", [
        { stockId: "A", shares: 100_000 },
        { stockId: "B", shares: 50_000 },
      ])],
    }) as GameState;
    const h = holdingsOfOwner(s, "Korsägaren");
    // Störst värde först: B = 50 000 × 200 = 10 MSEK, A = 100 000 × 50 = 5 MSEK.
    expect(h[0].owner).toBe("B AB");
    expect(h[0].share).toBeCloseTo(0.1, 6);
    expect(h[1].owner).toBe("A AB");
    expect(h[1].share).toBeCloseTo(0.1, 6);
  });

  it("klarar bolag utan ägardata utan att spricka", () => {
    const st = stock();
    const s = makeState({ stocks: [st], competitors: [] }) as GameState;
    const o = ownershipOf(s, st);
    expect(o.stakes).toHaveLength(1);
    expect(o.stakes[0].owner).toBe("Market");
    expect(o.stakes[0].share).toBeCloseTo(1, 6);
  });
});
