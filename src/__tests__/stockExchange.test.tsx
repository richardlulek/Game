import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockExchange } from "../components/StockExchange";
import { initStocks } from "../engine/stocks";
import type { Competitor } from "../engine/types";
import { makeState } from "./factories";

function stateWithMarket() {
  const comps: Competitor[] = [
    { name: "Rival AB", cash: 2e6, units: 6, equity: 24e6, monthlyNOI: 120_000, portfolio: [], strategy: "tillväxt" },
  ];
  const stocks = initStocks(comps).map((s) => ({
    ...s,
    monthClose: s.price * 0.97,
    prevPrice: s.price * 0.995,
    history: [s.price * 0.9, s.price * 0.95, s.price],
  }));
  return makeState({
    year: 1, month: 6,
    competitors: comps,
    stocks,
    marketSentiment: 1.05,
    sentimentHistory: [1.0, 1.02, 1.05],
    portfolioValueHistory: [0, 100_000, 250_000],
    dividendsReceived: 12_000,
    marketCycle: { phase: "boom", monthsRemaining: 8 },
    interestRate: 4.25,
  });
}

describe("StockExchange (rendering)", () => {
  it("renderar börsvyn utan att krascha och utan NaN", () => {
    const html = renderToStaticMarkup(<StockExchange state={stateWithMarket()} dispatch={() => {}} />);
    expect(html).toContain("STOCK EXCHANGE");
    expect(html).toContain("Market index");
    expect(html).not.toContain("NaN");
  });

  it("visar ticker, sorterbar tabell och bolagsnamn", () => {
    const html = renderToStaticMarkup(<StockExchange state={stateWithMarket()} dispatch={() => {}} />);
    // Tabellrubriker
    expect(html).toContain("Company");
    expect(html).toContain("Price");
    expect(html).toContain("P/E");
    // Både externa bolag och rivalen listas
    expect(html).toContain("Handelsbanken");
    expect(html).toContain("Rival AB");
    // Makrokoppling i headern
    expect(html).toContain("Policy rate");
    expect(html).toContain("Boom");
  });

  it("tom marknad ger tom-läge utan krasch", () => {
    const s = makeState({ stocks: [], sentimentHistory: [1], marketSentiment: 1 });
    const html = renderToStaticMarkup(<StockExchange state={s} dispatch={() => {}} />);
    expect(html).toContain("No companies match the filter");
  });
});
