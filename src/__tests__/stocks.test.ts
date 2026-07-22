import { afterEach, describe, expect, it, vi } from "vitest";
import { equityOf } from "../engine/finance";
import { reducer } from "../engine/reducer";
import { priceStocks, stockHoldingsValue, subsidiaryValue } from "../engine/stocks";
import type { Competitor, Stock } from "../engine/types";
import { makeProperty, makeState } from "./factories";

afterEach(() => vi.restoreAllMocks());

function stock(over: Partial<Stock> = {}): Stock {
  return {
    id: "s1", name: "Test AB", sector: "bank", price: 100, prevPrice: 100,
    sharesOutstanding: 1000, owned: 0, avgCost: 0, dividendYield: 0.06,
    beta: 1, drift: 0, volatility: 0.02, history: [100], ...over,
  };
}

describe("aktiehandel", () => {
  it("BUY_SHARES drar kassa (med courtage) och ökar innehav + snittkurs", () => {
    const s = makeState({ cash: 1_000_000, stocks: [stock()] });
    const next = reducer(s, { type: "BUY_SHARES", stockId: "s1", qty: 100 });
    expect(next.stocks[0].owned).toBe(100);
    expect(next.stocks[0].avgCost).toBe(100);
    expect(next.cash).toBeCloseTo(1_000_000 - 100 * 100 * 1.003, 2);
  });

  it("BUY_SHARES blockeras vid för lite kassa", () => {
    const s = makeState({ cash: 5_000, stocks: [stock()] });
    const next = reducer(s, { type: "BUY_SHARES", stockId: "s1", qty: 100 });
    expect(next.stocks[0].owned).toBe(0);
  });

  it("SELL_SHARES ökar kassa och minskar innehav", () => {
    const s = makeState({ cash: 0, stocks: [stock({ owned: 100, avgCost: 100, price: 120 })] });
    const next = reducer(s, { type: "SELL_SHARES", stockId: "s1", qty: 50 });
    expect(next.stocks[0].owned).toBe(50);
    expect(next.cash).toBeCloseTo(50 * 120 * 0.997, 2);
  });
});

describe("uppköp av konkurrent", () => {
  const comp: Competitor = { name: "Rival AB", cash: 1e6, units: 4, equity: 12e6, monthlyNOI: 50_000, portfolio: [] };

  it("ACQUIRE_COMPANY kräver majoritet (>50 %)", () => {
    const s = makeState({
      cash: 10e6, competitors: [comp],
      stocks: [stock({ id: "c0", competitorName: "Rival AB", owned: 400, sharesOutstanding: 1000 })],
    });
    const next = reducer(s, { type: "ACQUIRE_COMPANY", stockId: "c0" });
    expect(next.stocks).toHaveLength(1); // oförändrat
    expect(next.competitors).toHaveLength(1);
  });

  it("ACQUIRE_COMPANY vid 50–75 % är ett fientligt bud (premie 30 %)", () => {
    const hus = makeProperty({ id: 71, owned: false, parcelId: "centrum-2" });
    const s = makeState({
      cash: 10e6, competitors: [{ ...comp, portfolio: [hus] }], reputation: 50,
      stocks: [stock({ id: "c0", name: "Rival AB", competitorName: "Rival AB", owned: 600, sharesOutstanding: 1000, price: 100 })],
    });
    const next = reducer(s, { type: "ACQUIRE_COMPANY", stockId: "c0" });
    expect(next.competitors).toHaveLength(0);
    expect(next.stocks).toHaveLength(0);
    // Fusion, inte skalbolag: fastigheterna (med tomtruta) och kassan tillförs.
    expect(next.subsidiaries).toHaveLength(0);
    const köpt = next.portfolio.find((p) => p.id === 71);
    expect(köpt?.owned).toBe(true);
    expect(köpt?.parcelId).toBe("centrum-2"); // huset står kvar på kartan
    // fientligt bud: 30 % premie på resterande 400 aktier, + bolagets kassa 1 Msek
    expect(next.cash).toBeCloseTo(10e6 - 400 * 100 * 1.3 + 1e6, 2);
    expect(next.reputation).toBe(47);
  });

  it("ACQUIRE_COMPANY vid bred majoritet (>75 %) är ett vänligt bud (premie 15 %)", () => {
    const s = makeState({
      cash: 10e6, competitors: [comp], reputation: 50,
      stocks: [stock({ id: "c0", name: "Rival AB", competitorName: "Rival AB", owned: 800, sharesOutstanding: 1000, price: 100 })],
    });
    const next = reducer(s, { type: "ACQUIRE_COMPANY", stockId: "c0" });
    expect(next.subsidiaries).toHaveLength(0);
    // vänligt bud: 15 % premie på resterande 200 aktier + bolagets kassa, rykte +4
    expect(next.cash).toBeCloseTo(10e6 - 200 * 100 * 1.15 + 1e6, 2);
    expect(next.reputation).toBe(54);
  });

  it("ACQUIRE_RIVAL fusioneras in: kassa följer med, aktien avnoteras, inget skalbolag", () => {
    const hus = makeProperty({ id: 72, owned: false, askPrice: 5e6, parcelId: "centrum-3" });
    const rival: Competitor = { name: "Rival AB", cash: 2e6, units: 1, equity: 7e6, monthlyNOI: 40_000, portfolio: [hus] };
    const s = makeState({
      cash: 20e6, competitors: [rival],
      stocks: [stock({ id: "c0", name: "Rival AB", competitorName: "Rival AB", owned: 200, sharesOutstanding: 1000, price: 100 })],
    });
    // Pris 130 % av EK = 9,1 Msek; egen aktiepost 20 % räknas av → 7,28 Msek.
    const next = reducer(s, { type: "ACQUIRE_RIVAL", competitorName: "Rival AB", amount: 9_100_000 });
    expect(next.competitors).toHaveLength(0);
    expect(next.subsidiaries).toHaveLength(0); // ingen spökintäkt ovanpå husen
    expect(next.stocks).toHaveLength(0); // avnoterad
    expect(next.portfolio.find((p) => p.id === 72)?.parcelId).toBe("centrum-3");
    const price = Math.round(9_100_000 * 0.8);
    const down = Math.round(price * 0.25);
    const integration = Math.round(price * 0.02); // integrationskostnad (mna.ts)
    expect(next.cash).toBe(20e6 - down - integration + 2e6); // handpenning + integration ut, rivalens kassa in
    expect(next.debt).toBe(price - down);
    expect(next.integrations).toHaveLength(1);
  });
});

describe("värdering & prissättning", () => {
  it("equityOf inkluderar aktier och dotterbolag", () => {
    const s = makeState({
      cash: 0, debt: 0, portfolio: [],
      stocks: [stock({ owned: 100, price: 100 })],
      subsidiaries: [{ name: "Dotter", monthlyIncome: 6_000 }],
    });
    // 100*100 + 6000*12/0.06 = 10 000 + 1 200 000
    expect(stockHoldingsValue(s)).toBe(10_000);
    expect(subsidiaryValue(s)).toBe(1_200_000);
    expect(equityOf(s)).toBe(1_210_000);
  });

  it("priceStocks betalar utdelning proportionellt mot innehav", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { stocks, dividends } = priceStocks([stock({ owned: 100, price: 100, dividendYield: 0.06 })], 0, []);
    expect(dividends).toBe(50); // 100*100*0.06/12
    expect(stocks[0].price).toBeGreaterThan(0);
    expect(stocks[0].prevPrice).toBe(100);
  });
});
