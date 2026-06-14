/* ============================================================
   Börsen – aktiemarknad runt fastighetsbolaget.
   Konkurrenter är noterade (länkas via competitorName) och kan
   köpas upp; därtill finns andra bolag i olika branscher så att
   marknaden känns levande. Ren logik, inga React-beroenden.
   ============================================================ */

import { rnd } from "./random";
import type { Competitor, Sector, Stock } from "./types";

const COURTAGE = 0.003; // 0,3 % avgift per affär
const STOCK_CAP_RATE = 0.06; // för att kapitalisera dotterbolagsintäkt

/** Andra börsbolag (ej direkta konkurrenter) – ger bredd åt marknaden. */
interface CompanyDef {
  id: string;
  name: string;
  sector: Sector;
  price: number;
  sharesOutstanding: number;
  dividendYield: number;
  beta: number;
  drift: number;
  volatility: number;
}

const OTHER_COMPANIES: CompanyDef[] = [
  { id: "handelsbk", name: "Handelsbanken",  sector: "bank",     price: 112, sharesOutstanding: 2_000_000, dividendYield: 0.052, beta: 1.15, drift: 0.0030, volatility: 0.035 },
  { id: "skanska",   name: "Skanska Bygg",   sector: "bygg",     price: 168, sharesOutstanding: 1_400_000, dividendYield: 0.040, beta: 1.40, drift: 0.0035, volatility: 0.050 },
  { id: "ica",       name: "ICA Gruppen",    sector: "handel",   price: 240, sharesOutstanding: 1_000_000, dividendYield: 0.030, beta: 0.80, drift: 0.0030, volatility: 0.028 },
  { id: "sandvik",   name: "Sandvik",        sector: "industri", price: 196, sharesOutstanding: 1_600_000, dividendYield: 0.028, beta: 1.10, drift: 0.0040, volatility: 0.042 },
  { id: "sbb",       name: "SBB Norden",     sector: "fastighet",price: 88,  sharesOutstanding: 2_200_000, dividendYield: 0.045, beta: 1.30, drift: 0.0025, volatility: 0.055 },
  { id: "volvo",     name: "Volvo Group",    sector: "industri", price: 154, sharesOutstanding: 1_800_000, dividendYield: 0.035, beta: 1.05, drift: 0.0038, volatility: 0.040 },
];

/** Bygger den initiala aktielistan: noterade konkurrenter + andra bolag. */
export function initStocks(competitors: Competitor[]): Stock[] {
  const compStocks: Stock[] = competitors.map((c, i) => {
    const shares = 200_000;
    const price = Math.max(10, Math.round((c.equity / shares) * 100) / 100);
    return {
      id: `comp-${i}`,
      name: c.name,
      sector: "fastighet",
      price,
      prevPrice: price,
      sharesOutstanding: shares,
      owned: 0,
      avgCost: 0,
      dividendYield: 0.032,
      beta: 1.15,
      drift: 0.003,
      volatility: 0.045,
      history: [price],
      competitorName: c.name,
    };
  });
  const others: Stock[] = OTHER_COMPANIES.map((d) => ({
    ...d,
    prevPrice: d.price,
    owned: 0,
    avgCost: 0,
    history: [d.price],
  }));
  return [...compStocks, ...others];
}

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

/** Värdet av spelarens aktieinnehav. */
export function stockHoldingsValue(state: { stocks?: Stock[] }): number {
  return (state.stocks ?? []).reduce((a, s) => a + s.owned * s.price, 0);
}

/** Kapitaliserat värde av förvärvade dotterbolag. */
export function subsidiaryValue(state: { subsidiaries?: { monthlyIncome: number }[] }): number {
  return (state.subsidiaries ?? []).reduce((a, s) => a + (s.monthlyIncome * 12) / STOCK_CAP_RATE, 0);
}

/**
 * Stegar marknaden en månad. `sentReturn` är förändringen i sentiment
 * sedan förra månaden. Priser rör sig med trend, beta·sentiment,
 * branschtrend och brus; konkurrentaktier dras mot bokfört värde.
 * Returnerar nya aktier samt total utdelning till spelaren.
 */
export function priceStocks(
  stocks: Stock[],
  sentReturn: number,
  competitors: Competitor[],
): { stocks: Stock[]; dividends: number } {
  const sectorTrend: Record<Sector, number> = {
    fastighet: rnd(-0.012, 0.014),
    bank: rnd(-0.010, 0.012),
    bygg: rnd(-0.016, 0.018),
    handel: rnd(-0.008, 0.010),
    industri: rnd(-0.013, 0.015),
  };
  let dividends = 0;
  const next = stocks.map((st) => {
    const noise = rnd(-st.volatility, st.volatility);
    const ret = st.drift + st.beta * sentReturn + sectorTrend[st.sector] + noise;
    let price = Math.max(1, st.price * (1 + ret));
    if (st.competitorName) {
      const c = competitors.find((x) => x.name === st.competitorName);
      if (c) {
        const book = c.equity / st.sharesOutstanding;
        price = price * 0.7 + book * 0.3; // dras mot substansvärde
      }
    }
    price = Math.round(price * 100) / 100;
    dividends += (st.price * st.owned * st.dividendYield) / 12;
    return {
      ...st,
      prevPrice: st.price,
      price,
      history: [...st.history, price].slice(-32),
    };
  });
  return { stocks: next, dividends: Math.round(dividends) };
}

/** Nästa sentiment via mjuk medelåtergång + brus, klippt till rimligt spann. */
export function stepSentiment(current: number): number {
  const s = current + (1 - current) * 0.04 + rnd(-0.025, 0.025);
  return +clamp(0.55, 1.6, s).toFixed(3);
}

export { COURTAGE };
