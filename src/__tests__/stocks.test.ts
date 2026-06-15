import { afterEach, describe, expect, it, vi } from "vitest";
import { equityOf } from "../engine/finance";
import { reducer } from "../engine/reducer";
import { priceStocks, stockHoldingsValue, subsidiaryValue } from "../engine/stocks";
import type { Competitor, Stock } from "../engine/types";
import { makeState } from "./factories";

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

  it("ACQUIRE_COMPANY vid majoritet absorberar bolaget till dotterbolag", () => {
    const s = makeState({
      cash: 10e6, competitors: [comp],
      stocks: [stock({ id: "c0", name: "Rival AB", competitorName: "Rival AB", owned: 600, sharesOutstanding: 1000, price: 100 })],
    });
    const next = reducer(s, { type: "ACQUIRE_COMPANY", stockId: "c0" });
    expect(next.competitors).toHaveLength(0);
    expect(next.stocks).toHaveLength(0);
    expect(next.subsidiaries).toHaveLength(1);
    expect(next.subsidiaries[0].monthlyIncome).toBe(50_000);
    expect(next.cash).toBeCloseTo(10e6 - 400 * 100 * 1.2, 2);
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
