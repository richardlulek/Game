/* ============================================================
   Börsen – aktiemarknad runt fastighetsbolaget.
   Konkurrenter är noterade (länkas via competitorName) och kan
   köpas upp; därtill finns andra bolag i olika branscher så att
   marknaden känns levande. Ren logik, inga React-beroenden.
   ============================================================ */

import { kr } from "./format";
import { newId, rnd } from "./random";
import type { Competitor, GameState, LimitOrder, Sector, Stock, StockNews } from "./types";

const COURTAGE = 0.003; // 0,3 % avgift per affär
export const STOCK_CAP_RATE = 0.06; // för att kapitalisera dotterbolagsintäkt

const SECTOR_LABELS: Record<Sector, string> = {
  fastighet: "Fastighet",
  bank: "Bank",
  bygg: "Bygg",
  handel: "Handel",
  industri: "Industri",
};

// ── Bolagsspecifika nyhetshändelser ───────────────────────────────────
interface NewsTemplate {
  text: string;
  impact: [number, number]; // [min mult, max mult] på aktiekursen
}
const STOCK_NEWS: NewsTemplate[] = [
  { text: "{n}: vinst bättre än väntat – aktien stiger", impact: [1.05, 1.13] },
  { text: "{n}: vinst sämre än väntat – aktien faller", impact: [0.87, 0.95] },
  { text: "{n}: analytiker höjer riktkurs", impact: [1.03, 1.09] },
  { text: "{n}: analytiker sänker riktkurs", impact: [0.91, 0.97] },
  { text: "{n}: storkontrakt vunnet", impact: [1.06, 1.15] },
  { text: "{n}: VD avgår oväntat", impact: [0.84, 0.93] },
  { text: "{n}: Finansinspektionen inleder granskning", impact: [0.79, 0.90] },
  { text: "{n}: förvärvsrykte stiger", impact: [1.08, 1.18] },
  { text: "{n}: utdelningen sänks", impact: [0.87, 0.93] },
  { text: "{n}: aktieåterköpsprogram annonseras", impact: [1.04, 1.10] },
  { text: "{n}: rekordutdelning höjer aktien", impact: [1.06, 1.12] },
  { text: "{n}: strejkhot tynger bolaget", impact: [0.91, 0.97] },
];

/** Datumstämpel för nyhetshistoriken. */
export interface StockDate { day: number; month: number; year: number }

/** Lägger till en post först i aktiens egen nyhetshistorik (cap 12). */
function pushNews(s: Stock, text: string, dir: "up" | "down" | "flat", date: StockDate): StockNews[] {
  const entry: StockNews = { text, dir, ...date };
  return [entry, ...(s.newsHistory ?? [])].slice(0, 12);
}

/** Applicerar slumpmässig bolagsnyhet (20 % chans per månad). */
export function applyStockNews(
  stocks: Stock[],
  date: StockDate = { day: 1, month: 1, year: 1 },
): { stocks: Stock[]; newsEntry: string | null } {
  if (Math.random() > 0.20 || stocks.length === 0)
    return { stocks, newsEntry: null };
  const idx = Math.floor(Math.random() * stocks.length);
  const target = stocks[idx];
  const tmpl = STOCK_NEWS[Math.floor(Math.random() * STOCK_NEWS.length)];
  const [lo, hi] = tmpl.impact;
  const mult = lo + Math.random() * (hi - lo);
  const newPrice = Math.max(1, Math.round(target.price * mult * 100) / 100);
  const text = tmpl.text.replace("{n}", target.name);
  const dir: "up" | "down" | "flat" = mult > 1.01 ? "up" : mult < 0.99 ? "down" : "flat";
  // Determine analyst rating change from news text
  let newRating: "Köp" | "Behåll" | "Sälj" | undefined = undefined;
  if (tmpl.text.includes("höjer riktkurs") || tmpl.text.includes("Köp")) newRating = "Köp";
  else if (tmpl.text.includes("sänker riktkurs") || tmpl.text.includes("Finansinspektionen") || tmpl.text.includes("sämre än väntat")) newRating = "Sälj";
  else if (tmpl.text.includes("bättre än väntat") || tmpl.text.includes("storkontrakt") || tmpl.text.includes("förvärvsrykte") || tmpl.text.includes("aktieåterköp") || tmpl.text.includes("rekordutdelning")) newRating = "Köp";
  // Update EPS based on earnings beat/miss
  let epsMultiplier = 1.0;
  if (tmpl.text.includes("vinst bättre än väntat")) epsMultiplier = 1 + (Math.random() * 0.12 + 0.05);
  if (tmpl.text.includes("vinst sämre än väntat")) epsMultiplier = 1 - (Math.random() * 0.12 + 0.05);

  return {
    stocks: stocks.map((s) =>
      s.id === target.id
        ? {
            ...s,
            price: newPrice,
            targetPrice: newPrice,
            eps: s.eps !== undefined ? Math.max(0.01, Math.round(s.eps * epsMultiplier * 100) / 100) : s.eps,
            analystRating: newRating ?? s.analystRating,
            targetKurs: newRating === "Köp" ? Math.round(newPrice * 1.15 * 100) / 100
                      : newRating === "Sälj" ? Math.round(newPrice * 0.90 * 100) / 100
                      : s.targetKurs,
            history: [...s.history, newPrice].slice(-32),
            newsHistory: pushNews(s, text, dir, date),
          }
        : s,
    ),
    newsEntry: `📊 ${text}.`,
  };
}

/**
 * Kausala rivalnyheter (feature 7): rivalaktier reagerar på konkurrenternas
 * FAKTISKA månad – expanderande bestånd lyfter, sjunkande driftnetto pressar,
 * senaste förvärvet blir en rubrik. Marknaden blir därmed orsaksdriven i
 * stället för slumpmässig. Anropas månadsvis efter priceStocks.
 */
export function rivalNews(
  stocks: Stock[],
  competitors: Competitor[],
  date: StockDate,
): { stocks: Stock[]; events: string[] } {
  const events: string[] = [];
  const next = stocks.map((st) => {
    if (!st.competitorName || st.competitorName === "__player__") return st;
    const c = competitors.find((x) => x.name === st.competitorName);
    if (!c) return st;
    const prevUnits = st.rivalPrevUnits ?? c.units;
    const prevNOI = st.rivalPrevNOI ?? (c.monthlyNOI ?? 0);
    const curNOI = c.monthlyNOI ?? 0;
    let text: string | null = null;
    let dir: "up" | "down" | "flat" = "flat";
    let mult = 1;
    if (c.units > prevUnits) {
      text = `${c.name} expanderar beståndet till ${c.units} objekt`;
      dir = "up"; mult = rnd(1.02, 1.06);
    } else if (prevNOI > 0 && curNOI < prevNOI * 0.90) {
      text = `${c.name}: driftnettot pressas av vakanser`;
      dir = "down"; mult = rnd(0.93, 0.98);
    } else if (prevNOI > 0 && curNOI > prevNOI * 1.12) {
      text = `${c.name}: starkt driftnetto lyfter aktien`;
      dir = "up"; mult = rnd(1.02, 1.05);
    } else if (c.lastBuy && Math.random() < 0.25) {
      text = `${c.name} förvärvade ${c.lastBuy}`;
      dir = "up"; mult = rnd(1.005, 1.02);
    }
    const updated: Stock = { ...st, rivalPrevUnits: c.units, rivalPrevNOI: curNOI };
    if (!text) return updated;
    const price = Math.max(1, Math.round(st.price * mult * 100) / 100);
    events.push(`🏢 ${text}.`);
    return {
      ...updated,
      price,
      targetPrice: price,
      newsHistory: pushNews(st, text, dir, date),
    };
  });
  return { stocks: next, events };
}

/**
 * Dynamisk marknad (feature 10): då och då sker en nynotering (IPO),
 * en avnotering av ett svagt bolag, eller ett samgående mellan två
 * externbolag. Håller aktielistan levande i stället för statisk.
 * Rör aldrig konkurrentaktier, spelarens bolag (FBAB) eller innehav som
 * spelaren äger. Anropas månadsvis.
 */
export function maybeListingEvents(
  stocks: Stock[],
  date: StockDate,
): { stocks: Stock[]; events: string[] } {
  const events: string[] = [];
  let next = stocks;

  // Externbolag som varken är konkurrenter, spelarens bolag eller ägda.
  const externals = () => next.filter(
    (s) => !s.competitorName && s.id !== "FBAB" && s.owned === 0 && (s.shortQty ?? 0) === 0,
  );

  // ── Nynotering (IPO): ~4 % chans, om poolen har bolag som inte redan finns.
  if (Math.random() < 0.04) {
    const listedNames = new Set(next.map((s) => s.name));
    const candidates = IPO_POOL.filter((d) => !listedNames.has(d.name));
    if (candidates.length > 0) {
      const d = candidates[Math.floor(Math.random() * candidates.length)];
      const price = Math.round(d.price * rnd(0.95, 1.08) * 100) / 100;
      const stock: Stock = {
        ...d,
        id: `ipo-${newId()}`,
        price,
        prevPrice: price,
        monthClose: price,
        targetPrice: price,
        owned: 0,
        avgCost: 0,
        history: [price],
        eps: d.eps ?? Math.round(price * 0.07),
        analystRating: "Behåll",
        listedYear: date.year,
        listedMonth: date.month,
        newsHistory: [{ text: `${d.name} börsintroduceras`, dir: "up", ...date }],
      };
      next = [...next, stock];
      events.push(`🔔 Nynotering: ${d.name} (${SECTOR_LABELS[d.sector]}) debuterar på börsen @ ${kr(price)}.`);
    }
  }

  // ── Samgående (M&A): ~2 % chans, två externbolag i samma bransch → ett.
  if (Math.random() < 0.02) {
    const ext = externals();
    if (ext.length >= 2) {
      const acquirer = ext[Math.floor(Math.random() * ext.length)];
      const targetPool = ext.filter((s) => s.id !== acquirer.id && s.sector === acquirer.sector);
      const targ = targetPool.length > 0 ? targetPool[Math.floor(Math.random() * targetPool.length)] : null;
      if (targ) {
        const bumped = Math.round(acquirer.price * rnd(1.04, 1.10) * 100) / 100;
        next = next
          .filter((s) => s.id !== targ.id)
          .map((s) => s.id === acquirer.id
            ? { ...s, price: bumped, targetPrice: bumped, newsHistory: pushNews(s, `${acquirer.name} förvärvar ${targ.name}`, "up", date) }
            : s);
        events.push(`🤝 Samgående: ${acquirer.name} köper upp ${targ.name} — synergier lyfter aktien.`);
      }
    }
  }

  // ── Avnotering: ~1,5 % chans, ett svagt externbolag lämnar börsen.
  if (Math.random() < 0.015) {
    const weak = externals().filter((s) => s.price < 40);
    if (weak.length > 0) {
      const gone = weak[Math.floor(Math.random() * weak.length)];
      next = next.filter((s) => s.id !== gone.id);
      events.push(`⚠️ Avnotering: ${gone.name} lämnar börsen efter svag utveckling.`);
    }
  }

  return { stocks: next, events };
}

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
  eps?: number;
}

const OTHER_COMPANIES: CompanyDef[] = [
  { id: "handelsbk", name: "Handelsbanken",  sector: "bank",     price: 112, sharesOutstanding: 2_000_000, dividendYield: 0.052, beta: 1.15, drift: 0.0030, volatility: 0.035, eps: 9.80 },
  { id: "skanska",   name: "Skanska Bygg",   sector: "bygg",     price: 168, sharesOutstanding: 1_400_000, dividendYield: 0.040, beta: 1.40, drift: 0.0035, volatility: 0.050, eps: 12.60 },
  { id: "ica",       name: "ICA Gruppen",    sector: "handel",   price: 240, sharesOutstanding: 1_000_000, dividendYield: 0.030, beta: 0.80, drift: 0.0030, volatility: 0.028, eps: 16.80 },
  { id: "sandvik",   name: "Sandvik",        sector: "industri", price: 196, sharesOutstanding: 1_600_000, dividendYield: 0.028, beta: 1.10, drift: 0.0040, volatility: 0.042, eps: 14.20 },
  { id: "sbb",       name: "SBB Norden",     sector: "fastighet",price: 88,  sharesOutstanding: 2_200_000, dividendYield: 0.045, beta: 1.30, drift: 0.0025, volatility: 0.055, eps: 5.50 },
  { id: "volvo",     name: "Volvo Group",    sector: "industri", price: 154, sharesOutstanding: 1_800_000, dividendYield: 0.035, beta: 1.05, drift: 0.0038, volatility: 0.040, eps: 12.80 },
];

/** Pool av fiktiva bolag som kan nyintroduceras på börsen (feature 10). */
const IPO_POOL: Omit<CompanyDef, "id">[] = [
  { name: "Nordbygg Entreprenad", sector: "bygg",      price: 95,  sharesOutstanding: 1_200_000, dividendYield: 0.030, beta: 1.35, drift: 0.0040, volatility: 0.055, eps: 6.40 },
  { name: "Svea Detaljhandel",    sector: "handel",    price: 128, sharesOutstanding: 900_000,   dividendYield: 0.028, beta: 0.85, drift: 0.0032, volatility: 0.030, eps: 8.60 },
  { name: "Baltic Industri",      sector: "industri",  price: 142, sharesOutstanding: 1_100_000, dividendYield: 0.026, beta: 1.20, drift: 0.0042, volatility: 0.048, eps: 9.90 },
  { name: "Kronan Fastigheter",   sector: "fastighet", price: 76,  sharesOutstanding: 1_800_000, dividendYield: 0.048, beta: 1.25, drift: 0.0026, volatility: 0.050, eps: 4.80 },
  { name: "Första Sparbanken",    sector: "bank",      price: 88,  sharesOutstanding: 1_600_000, dividendYield: 0.050, beta: 1.05, drift: 0.0028, volatility: 0.032, eps: 7.20 },
  { name: "Mälaren Logistik",     sector: "industri",  price: 110, sharesOutstanding: 1_000_000, dividendYield: 0.024, beta: 1.15, drift: 0.0044, volatility: 0.046, eps: 7.80 },
  { name: "Aurora Data",          sector: "handel",    price: 64,  sharesOutstanding: 1_400_000, dividendYield: 0.005, beta: 1.75, drift: 0.0070, volatility: 0.090, eps: 1.20 },
  { name: "Optimus Telekom",      sector: "handel",    price: 158, sharesOutstanding: 1_300_000, dividendYield: 0.010, beta: 1.60, drift: 0.0060, volatility: 0.080, eps: 3.40 },
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
      monthClose: price,
      targetPrice: price,
      sharesOutstanding: shares,
      owned: 0,
      avgCost: 0,
      dividendYield: 0.032,
      beta: 1.15,
      drift: 0.003,
      volatility: 0.045,
      history: [price],
      competitorName: c.name,
      eps: Math.round(price * 0.07 * 100) / 100,
      analystRating: "Behåll" as const,
      targetKurs: Math.round(price * 1.05 * 100) / 100,
      rivalPrevUnits: c.units,
      rivalPrevNOI: c.monthlyNOI ?? 0,
    };
  });
  const others: Stock[] = OTHER_COMPANIES.map((d) => ({
    ...d,
    prevPrice: d.price,
    monthClose: d.price,
    targetPrice: d.price,
    owned: 0,
    avgCost: 0,
    history: [d.price],
    eps: d.eps ?? Math.round(d.price * 0.07),
    analystRating: "Behåll" as const,
    targetKurs: Math.round(d.price * 1.05 * 100) / 100,
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

/** Makroläge som kopplar börsen till den levande ekonomin (koppling 11). */
export interface StockMacro {
  /** Förändring i styrräntan denna månad (procentenheter, + = höjning). */
  rateChange?: number;
  /** Konjunkturfas. */
  cyclePhase?: "boom" | "stable" | "bust";
}

/** Branschvis makrokänslighet: hur olika sektorer reagerar på ränta och konjunktur. */
function macroBias(sector: Sector, macro: StockMacro): number {
  const rate = macro.rateChange ?? 0;
  const cyc = macro.cyclePhase ?? "stable";
  const boom = cyc === "boom" ? 1 : cyc === "bust" ? -1 : 0;
  switch (sector) {
    // Banker gynnas av högre ränta (räntenetto), pressas av sänkningar.
    case "bank": return rate * 0.030 + boom * 0.006;
    // Bygg och fastighet är räntekänsliga och konjunkturberoende.
    case "bygg": return -rate * 0.020 + boom * 0.012;
    case "fastighet": return -rate * 0.025 + boom * 0.009;
    // Handel/industri följer mest konjunkturen.
    case "handel": return boom * 0.007;
    case "industri": return boom * 0.010;
  }
}

/**
 * Stegar marknaden en månad. `sentReturn` är förändringen i sentiment
 * sedan förra månaden. Priser rör sig med trend, beta·sentiment,
 * branschtrend, makrokoppling och brus; konkurrentaktier dras mot bokfört
 * värde. Sätter även månadens fundamentala ankare (`targetPrice`) som
 * intradagsvandringen dras mot, och `monthClose` för månadsförändringen.
 * Returnerar nya aktier samt total utdelning till spelaren.
 */
export function priceStocks(
  stocks: Stock[],
  sentReturn: number,
  competitors: Competitor[],
  macro: StockMacro = {},
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
    const ret = st.drift + st.beta * sentReturn + sectorTrend[st.sector] + macroBias(st.sector, macro) + noise;
    let price = Math.max(1, st.price * (1 + ret));
    if (st.competitorName && st.competitorName !== "__player__") {
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
      monthClose: st.price,
      prevPrice: st.price,
      price,
      targetPrice: price,
      history: [...st.history, price].slice(-32),
    };
  });
  return { stocks: next, dividends: Math.round(dividends) };
}

/**
 * Intradagsrörelse (feature 3): en liten daglig slumpvandring som dras mjukt
 * mot månadens fundamentala ankare (`targetPrice`). Ger börsen liv i realtid
 * med den rullande dagskalendern utan att ändra fundamenta – månadsstängningen
 * i `priceStocks` sätter fortfarande riktningen. Anropas per dag i advanceDay.
 */
export function stepStocksDaily(stocks: Stock[]): Stock[] {
  if (stocks.length === 0) return stocks;
  return stocks.map((st) => {
    const anchor = st.targetPrice ?? st.price;
    const dailyVol = st.volatility / 6;
    const noise = rnd(-dailyVol, dailyVol);
    const pull = ((anchor - st.price) / anchor) * 0.15; // mjuk återgång till ankaret
    const price = Math.max(1, Math.round(st.price * (1 + noise + pull) * 100) / 100);
    return { ...st, prevPrice: st.price, price };
  });
}

/** Nästa sentiment via mjuk medelåtergång + brus, klippt till rimligt spann.
 *  Konjunkturcykeln ger en drift: börsen stiger i boom och faller i bust. */
export function stepSentiment(current: number, cycle?: "boom" | "stable" | "bust"): number {
  const cycleDrift = cycle === "boom" ? 0.012 : cycle === "bust" ? -0.016 : 0;
  const s = current + (1 - current) * 0.04 + cycleDrift + rnd(-0.025, 0.025);
  return +clamp(0.55, 1.6, s).toFixed(3);
}

/**
 * Kontrollerar öppna limitorder mot aktuella kurser och exekverar dem.
 * Returnerar uppdaterat state plus loggmeddelanden för utförda ordrar.
 */
export function executeLimitOrders(
  state: GameState,
): { state: GameState; fills: string[] } {
  const orders: LimitOrder[] = state.stockOrders ?? [];
  if (orders.length === 0) return { state, fills: [] };

  let s: GameState = { ...state, stocks: [...state.stocks] };
  const fills: string[] = [];
  const remaining: LimitOrder[] = [];

  for (const order of orders) {
    const stock = s.stocks.find((x) => x.id === order.stockId);
    if (!stock) {
      // Aktien försvann (förvärv) – avbryt ordern tyst.
      continue;
    }
    const triggered =
      (order.side === "buy" && stock.price <= order.limitPrice) ||
      (order.side === "sell" && stock.price >= order.limitPrice);

    if (!triggered) {
      remaining.push(order);
      continue;
    }

    if (order.side === "buy") {
      const available = stock.sharesOutstanding - stock.owned;
      const qty = Math.min(order.qty, available);
      const cost = qty * stock.price * (1 + COURTAGE);
      if (s.cash < cost || qty <= 0) {
        fills.push(`⚠️ Limitorder avbröts – kunde ej köpa ${order.stockName}: otillräcklig kassa.`);
        continue;
      }
      const newOwned = stock.owned + qty;
      const newAvg = (stock.owned * stock.avgCost + qty * stock.price) / newOwned;
      s = {
        ...s,
        cash: s.cash - cost,
        stocks: s.stocks.map((x) =>
          x.id === stock.id
            ? { ...x, owned: newOwned, avgCost: +newAvg.toFixed(2) }
            : x,
        ),
      };
      fills.push(
        `✅ Limitorder utförd: Köpte ${qty.toLocaleString("sv-SE")} aktier i ${order.stockName} @ ${kr(stock.price)}.`,
      );
    } else {
      const qty = Math.min(order.qty, stock.owned);
      if (qty <= 0) {
        fills.push(`⚠️ Limitorder avbröts – inga aktier att sälja i ${order.stockName}.`);
        continue;
      }
      const proceeds = qty * stock.price * (1 - COURTAGE);
      const newOwned = stock.owned - qty;
      s = {
        ...s,
        cash: s.cash + proceeds,
        stocks: s.stocks.map((x) =>
          x.id === stock.id
            ? { ...x, owned: newOwned, avgCost: newOwned === 0 ? 0 : x.avgCost }
            : x,
        ),
      };
      fills.push(
        `✅ Limitorder utförd: Sålde ${qty.toLocaleString("sv-SE")} aktier i ${order.stockName} @ ${kr(stock.price)}.`,
      );
    }
  }

  s.stockOrders = remaining;
  return { state: s, fills };
}

/**
 * Kvartalsvinster – stor kursrörelse baserad på "beat/miss" relativt konsensus.
 * Anropas var tredje månad i simulation.ts.
 */
export function quarterlyEarnings(
  stocks: Stock[],
  marketSentiment: number,
  date: StockDate = { day: 1, month: 1, year: 1 },
): { stocks: Stock[]; events: string[] } {
  const events: string[] = [];
  const next = stocks.map((st) => {
    if (st.competitorName === "__player__") return st; // FBAB hanteras separat
    // Sannolikhet för "beat": högre när sentiment är bra
    const beatProb = 0.45 + (marketSentiment - 1) * 0.25;
    const beat = Math.random() < beatProb;
    const surprise = beat
      ? 1.0 + rnd(0.04, 0.18) // +4 till +18 %
      : 1.0 - rnd(0.04, 0.16); // −4 till −16 %
    const newPrice = Math.max(1, Math.round(st.price * surprise * 100) / 100);
    // EPS uppdateras med kvartalets utfall
    const newEps = st.eps !== undefined
      ? Math.max(0.01, Math.round(st.eps * (beat ? rnd(1.02, 1.10) : rnd(0.90, 0.98)) * 100) / 100)
      : st.eps;
    const newRating: "Köp" | "Behåll" | "Sälj" = beat
      ? (surprise > 1.10 ? "Köp" : "Behåll")
      : (surprise < 0.92 ? "Sälj" : "Behåll");
    const notable = Math.abs(surprise - 1) > 0.08;
    const headline = `${st.name}: ${beat ? "slog" : "missade"} kvartalsprognosen (${beat ? "+" : ""}${((surprise - 1) * 100).toFixed(0)} %)`;
    if (notable) events.push(`📊 ${headline}.`);
    return {
      ...st,
      price: newPrice,
      targetPrice: newPrice,
      eps: newEps,
      analystRating: newRating,
      targetKurs: newRating === "Köp" ? Math.round(newPrice * 1.15 * 100) / 100
                : newRating === "Sälj" ? Math.round(newPrice * 0.90 * 100) / 100
                : st.targetKurs,
      history: [...st.history, newPrice].slice(-32),
      newsHistory: notable ? pushNews(st, headline, beat ? "up" : "down", date) : st.newsHistory,
    };
  });
  return { stocks: next, events };
}

export { COURTAGE };
