import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initStocks,
  maybeListingEvents,
  priceStocks,
  rivalNews,
  stepStocksDaily,
} from "../engine/stocks";
import type { Competitor, Stock } from "../engine/types";

const DATE = { day: 1, month: 6, year: 1 };

function mkStock(over: Partial<Stock> = {}): Stock {
  return {
    id: "x1",
    name: "Testbolag",
    sector: "industri",
    price: 100,
    prevPrice: 100,
    monthClose: 100,
    targetPrice: 100,
    sharesOutstanding: 1_000_000,
    owned: 0,
    avgCost: 0,
    dividendYield: 0.03,
    beta: 1.0,
    drift: 0,
    volatility: 0.04,
    history: [100],
    ...over,
  };
}

function mkComp(over: Partial<Competitor> = {}): Competitor {
  return { name: "Rival AB", cash: 1_000_000, units: 5, equity: 20_000_000, portfolio: [], monthlyNOI: 100_000, ...over };
}

describe("intradagsrörelse (stepStocksDaily)", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it("uppdaterar prevPrice och håller kursen nära ankaret", () => {
    const [next] = stepStocksDaily([mkStock({ price: 100, targetPrice: 100 })]);
    expect(next.prevPrice).toBe(100);
    // random 0.5 → noise 0, pull 0 → kursen står still vid ankaret
    expect(next.price).toBe(100);
  });

  it("dras mot targetPrice när kursen avvikit", () => {
    const [next] = stepStocksDaily([mkStock({ price: 80, targetPrice: 100 })]);
    // pull = (100-80)/100*0.15 = +0.03 → kursen rör sig uppåt mot ankaret
    expect(next.price).toBeGreaterThan(80);
  });

  it("tom lista är en no-op", () => {
    expect(stepStocksDaily([])).toEqual([]);
  });
});

describe("makrokoppling (priceStocks)", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it("bankaktier lyfts av en räntehöjning", () => {
    const bank = mkStock({ sector: "bank", price: 100 });
    const flat = priceStocks([bank], 0, [], { rateChange: 0 }).stocks[0];
    const hike = priceStocks([bank], 0, [], { rateChange: 0.25 }).stocks[0];
    expect(hike.price).toBeGreaterThan(flat.price);
  });

  it("sätter monthClose och targetPrice", () => {
    const out = priceStocks([mkStock({ price: 100 })], 0, []).stocks[0];
    expect(out.monthClose).toBe(100);
    expect(out.targetPrice).toBe(out.price);
  });
});

describe("kausala rivalnyheter (rivalNews)", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it("expanderande rival ger positiv nyhet och kurslyft", () => {
    const stock = mkStock({ sector: "fastighet", competitorName: "Rival AB", rivalPrevUnits: 5, rivalPrevNOI: 100_000 });
    const comp = mkComp({ units: 8, monthlyNOI: 100_000 });
    const { stocks, events } = rivalNews([stock], [comp], DATE);
    expect(events.length).toBe(1);
    expect(events[0]).toContain("expands");
    expect(stocks[0].price).toBeGreaterThan(100);
    expect(stocks[0].newsHistory?.[0].dir).toBe("up");
    expect(stocks[0].rivalPrevUnits).toBe(8);
  });

  it("sjunkande driftnetto pressar kursen", () => {
    const stock = mkStock({ sector: "fastighet", competitorName: "Rival AB", rivalPrevUnits: 5, rivalPrevNOI: 100_000 });
    const comp = mkComp({ units: 5, monthlyNOI: 70_000 });
    const { stocks, events } = rivalNews([stock], [comp], DATE);
    expect(events[0]).toContain("pressured");
    expect(stocks[0].price).toBeLessThan(100);
  });
});

describe("dynamisk marknad (maybeListingEvents)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("nyintroducerar ett bolag när IPO-porten slår till", () => {
    const base = initStocks([]);
    const before = base.length;
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.0)  // IPO-gate < 0.04 → ja
      .mockReturnValueOnce(0.0)  // väljer kandidat 0
      .mockReturnValueOnce(0.5)  // priskrus
      .mockReturnValueOnce(0.99) // M&A-gate → nej
      .mockReturnValueOnce(0.99); // avnotering → nej
    const { stocks, events } = maybeListingEvents(base, DATE);
    expect(stocks.length).toBe(before + 1);
    expect(events[0]).toContain("New listing");
    const fresh = stocks[stocks.length - 1];
    expect(fresh.listedYear).toBe(DATE.year);
  });

  it("händer ingenting när portarna är stängda", () => {
    const base = initStocks([]);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { stocks, events } = maybeListingEvents(base, DATE);
    expect(stocks.length).toBe(base.length);
    expect(events.length).toBe(0);
  });
});
