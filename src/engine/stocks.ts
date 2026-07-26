/* ============================================================
   Börsen – aktiemarknad runt fastighetsbolaget.
   Konkurrenter är noterade (länkas via competitorName) och kan
   köpas upp; därtill finns andra bolag i olika branscher så att
   marknaden känns levande. Ren logik, inga React-beroenden.
   ============================================================ */

import { kr, msek } from "./format";
import { newId, pick, random01, rnd } from "./random";
import type { Competitor, GameState, LimitOrder, LogEntry, Sector, Stock, StockNews } from "./types";

const COURTAGE = 0.003; // 0,3 % avgift per affär
export const STOCK_CAP_RATE = 0.06; // för att kapitalisera dotterbolagsintäkt

const SECTOR_LABELS: Record<Sector, string> = {
  fastighet: "Real estate",
  bank: "Bank",
  bygg: "Construction",
  handel: "Retail",
  industri: "Industry",
};

// ── Bolagsspecifika nyhetshändelser ───────────────────────────────────
interface NewsTemplate {
  text: string;
  impact: [number, number]; // [min mult, max mult] på aktiekursen
}
const STOCK_NEWS: NewsTemplate[] = [
  { text: "{n}: profit beats expectations – the stock rises", impact: [1.05, 1.13] },
  { text: "{n}: profit misses expectations – the stock falls", impact: [0.87, 0.95] },
  { text: "{n}: analysts raise price target", impact: [1.03, 1.09] },
  { text: "{n}: analysts cut price target", impact: [0.91, 0.97] },
  { text: "{n}: major contract won", impact: [1.06, 1.15] },
  { text: "{n}: CEO resigns unexpectedly", impact: [0.84, 0.93] },
  { text: "{n}: the regulator opens an investigation", impact: [0.79, 0.90] },
  { text: "{n}: acquisition rumor rises", impact: [1.08, 1.18] },
  { text: "{n}: the dividend is cut", impact: [0.87, 0.93] },
  { text: "{n}: share buyback program announced", impact: [1.04, 1.10] },
  { text: "{n}: record dividend lifts the stock", impact: [1.06, 1.12] },
  { text: "{n}: strike threat weighs on the company", impact: [0.91, 0.97] },
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
  if (random01() > 0.20 || stocks.length === 0)
    return { stocks, newsEntry: null };
  const idx = Math.floor(random01() * stocks.length);
  const target = stocks[idx];
  const tmpl = STOCK_NEWS[Math.floor(random01() * STOCK_NEWS.length)];
  const [lo, hi] = tmpl.impact;
  const mult = lo + random01() * (hi - lo);
  const newPrice = Math.max(1, Math.round(target.price * mult * 100) / 100);
  const text = tmpl.text.replace("{n}", target.name);
  const dir: "up" | "down" | "flat" = mult > 1.01 ? "up" : mult < 0.99 ? "down" : "flat";
  // Determine analyst rating change from news text
  let newRating: "Buy" | "Hold" | "Sell" | undefined = undefined;
  if (tmpl.text.includes("raise price target")) newRating = "Buy";
  else if (tmpl.text.includes("cut price target") || tmpl.text.includes("regulator") || tmpl.text.includes("misses expectations")) newRating = "Sell";
  else if (tmpl.text.includes("beats expectations") || tmpl.text.includes("major contract") || tmpl.text.includes("acquisition rumor") || tmpl.text.includes("buyback") || tmpl.text.includes("record dividend")) newRating = "Buy";
  // Update EPS based on earnings beat/miss
  let epsMultiplier = 1.0;
  if (tmpl.text.includes("profit beats expectations")) epsMultiplier = 1 + (random01() * 0.12 + 0.05);
  if (tmpl.text.includes("profit misses expectations")) epsMultiplier = 1 - (random01() * 0.12 + 0.05);

  return {
    stocks: stocks.map((s) =>
      s.id === target.id
        ? {
            ...s,
            price: newPrice,
            targetPrice: newPrice,
            eps: s.eps !== undefined ? Math.max(0.01, Math.round(s.eps * epsMultiplier * 100) / 100) : s.eps,
            analystRating: newRating ?? s.analystRating,
            targetKurs: newRating === "Buy" ? Math.round(newPrice * 1.15 * 100) / 100
                      : newRating === "Sell" ? Math.round(newPrice * 0.90 * 100) / 100
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
      text = `${c.name} expands its portfolio to ${c.units} assets`;
      dir = "up"; mult = rnd(1.02, 1.06);
    } else if (prevNOI > 0 && curNOI < prevNOI * 0.90) {
      text = `${c.name}: net operating income pressured by vacancies`;
      dir = "down"; mult = rnd(0.93, 0.98);
    } else if (prevNOI > 0 && curNOI > prevNOI * 1.12) {
      text = `${c.name}: strong net operating income lifts the stock`;
      dir = "up"; mult = rnd(1.02, 1.05);
    } else if (c.lastBuy && random01() < 0.25) {
      text = `${c.name} acquired ${c.lastBuy}`;
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
  if (random01() < 0.04) {
    const listedNames = new Set(next.map((s) => s.name));
    const candidates = IPO_POOL.filter((d) => !listedNames.has(d.name));
    if (candidates.length > 0) {
      const d = candidates[Math.floor(random01() * candidates.length)];
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
        analystRating: "Hold",
        listedYear: date.year,
        listedMonth: date.month,
        newsHistory: [{ text: `${d.name} goes public`, dir: "up", ...date }],
      };
      next = [...next, stock];
      events.push(`🔔 New listing: ${d.name} (${SECTOR_LABELS[d.sector]}) debuts on the exchange @ ${kr(price)}.`);
    }
  }

  // ── Samgående (M&A): ~2 % chans, två externbolag i samma bransch → ett.
  if (random01() < 0.02) {
    const ext = externals();
    if (ext.length >= 2) {
      const acquirer = ext[Math.floor(random01() * ext.length)];
      const targetPool = ext.filter((s) => s.id !== acquirer.id && s.sector === acquirer.sector);
      const targ = targetPool.length > 0 ? targetPool[Math.floor(random01() * targetPool.length)] : null;
      if (targ) {
        const bumped = Math.round(acquirer.price * rnd(1.04, 1.10) * 100) / 100;
        next = next
          .filter((s) => s.id !== targ.id)
          .map((s) => s.id === acquirer.id
            ? { ...s, price: bumped, targetPrice: bumped, newsHistory: pushNews(s, `${acquirer.name} acquires ${targ.name}`, "up", date) }
            : s);
        events.push(`🤝 Merger: ${acquirer.name} buys out ${targ.name} — synergies lift the stock.`);
      }
    }
  }

  // ── Avnotering: ~1,5 % chans, ett svagt externbolag lämnar börsen.
  if (random01() < 0.015) {
    const weak = externals().filter((s) => s.price < 40);
    if (weak.length > 0) {
      const gone = weak[Math.floor(random01() * weak.length)];
      next = next.filter((s) => s.id !== gone.id);
      events.push(`⚠️ Delisting: ${gone.name} leaves the exchange after weak performance.`);
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
  { id: "handelsbk", name: "Crestline Bank",  sector: "bank",     price: 112, sharesOutstanding: 2_000_000, dividendYield: 0.052, beta: 1.15, drift: 0.0030, volatility: 0.035, eps: 9.80 },
  { id: "skanska",   name: "Ironclad Construction",   sector: "bygg",     price: 168, sharesOutstanding: 1_400_000, dividendYield: 0.040, beta: 1.40, drift: 0.0035, volatility: 0.050, eps: 12.60 },
  { id: "ica",       name: "Evermart Group",    sector: "handel",   price: 240, sharesOutstanding: 1_000_000, dividendYield: 0.030, beta: 0.80, drift: 0.0030, volatility: 0.028, eps: 16.80 },
  { id: "sandvik",   name: "Vulcan Industries",        sector: "industri", price: 196, sharesOutstanding: 1_600_000, dividendYield: 0.028, beta: 1.10, drift: 0.0040, volatility: 0.042, eps: 14.20 },
  { id: "sbb",       name: "Cornerstone REIT",     sector: "fastighet",price: 88,  sharesOutstanding: 2_200_000, dividendYield: 0.045, beta: 1.30, drift: 0.0025, volatility: 0.055, eps: 5.50 },
  { id: "volvo",     name: "Titan Motors",    sector: "industri", price: 154, sharesOutstanding: 1_800_000, dividendYield: 0.035, beta: 1.05, drift: 0.0038, volatility: 0.040, eps: 12.80 },
];

/** Pool av fiktiva bolag som kan nyintroduceras på börsen (feature 10). */
const IPO_POOL: Omit<CompanyDef, "id">[] = [
  { name: "Northbuild Contracting", sector: "bygg",      price: 95,  sharesOutstanding: 1_200_000, dividendYield: 0.030, beta: 1.35, drift: 0.0040, volatility: 0.055, eps: 6.40 },
  { name: "Crownline Retail",    sector: "handel",    price: 128, sharesOutstanding: 900_000,   dividendYield: 0.028, beta: 0.85, drift: 0.0032, volatility: 0.030, eps: 8.60 },
  { name: "Ironbay Industries",      sector: "industri",  price: 142, sharesOutstanding: 1_100_000, dividendYield: 0.026, beta: 1.20, drift: 0.0042, volatility: 0.048, eps: 9.90 },
  { name: "Keystone Properties",   sector: "fastighet", price: 76,  sharesOutstanding: 1_800_000, dividendYield: 0.048, beta: 1.25, drift: 0.0026, volatility: 0.050, eps: 4.80 },
  { name: "Union Savings Bank",    sector: "bank",      price: 88,  sharesOutstanding: 1_600_000, dividendYield: 0.050, beta: 1.05, drift: 0.0028, volatility: 0.032, eps: 7.20 },
  { name: "Redline Logistics",     sector: "industri",  price: 110, sharesOutstanding: 1_000_000, dividendYield: 0.024, beta: 1.15, drift: 0.0044, volatility: 0.046, eps: 7.80 },
  { name: "Aurora Data",          sector: "handel",    price: 64,  sharesOutstanding: 1_400_000, dividendYield: 0.005, beta: 1.75, drift: 0.0070, volatility: 0.090, eps: 1.20 },
  { name: "Nimbus Telecom",      sector: "handel",    price: 158, sharesOutstanding: 1_300_000, dividendYield: 0.010, beta: 1.60, drift: 0.0060, volatility: 0.080, eps: 3.40 },
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
      analystRating: "Hold" as const,
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
    analystRating: "Hold" as const,
    targetKurs: Math.round(d.price * 1.05 * 100) / 100,
  }));
  return [...compStocks, ...others];
}

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

/** Värdet av spelarens aktieinnehav. */
export function stockHoldingsValue(state: { stocks?: Stock[] }): number {
  return (state.stocks ?? []).reduce((a, s) => {
    let v = s.owned * s.price;
    // Blankning: säkerheten (1,5×) är fortfarande spelarens pengar och det
    // orealiserade resultatet hör till förmögenheten – annars ser en öppnad
    // blankning ut som en ren förlust i eget kapital tills den täcks.
    const q = s.shortQty ?? 0;
    if (q > 0) {
      const avg = s.shortAvgPrice ?? s.price;
      v += Math.max(0, Math.round(avg * q * 1.5) + Math.round(q * (avg - s.price)));
    }
    return a + v;
  }, 0);
}

/** Kapitaliserat värde av förvärvade dotterbolag. */
export function subsidiaryValue(state: { subsidiaries?: { monthlyIncome: number }[] }): number {
  return (state.subsidiaries ?? []).reduce((a, s) => a + (s.monthlyIncome * 12) / STOCK_CAP_RATE, 0);
}

/* ── Korsägande: rivalerna handlar aktier (à la Capitalism) ─────────── */

/** En rivals FBAB-aktier. */
export function fbabSharesOf(c: Competitor): number {
  return (c.stockHoldings ?? [])
    .filter((h) => h.stockId === "FBAB")
    .reduce((a, h) => a + h.shares, 0);
}

/** Rivalernas samlade innehav i SPELARENS bolag (aktier). */
export function rivalFbabShares(s: Pick<GameState, "competitors">): number {
  return (s.competitors ?? []).reduce((a, c) => a + fbabSharesOf(c), 0);
}

/** Marknadsvärdet på en rivals aktieportfölj. */
export function rivalHoldingsValue(c: Competitor, stocks: Stock[]): number {
  return (c.stockHoldings ?? []).reduce(
    (a, h) => a + (stocks.find((st) => st.id === h.stockId)?.price ?? 0) * h.shares,
    0,
  );
}

/**
 * Rivalernas månatliga aktiehandel: kapitalstarka bolag (särskilt värde-
 * och utdelningsstrategerna) bygger positioner i noterade bolag – varandras
 * OCH spelarens. De säljer i bust och tar hem vinster. FBAB-köp begränsas
 * till den FRIA floaten (aktivistens och andra rivalers aktier är inte till
 * salu, och börsens 10 %-spridning fredas) med tak på 10 % per rival.
 * Muterar s.competitors och returnerar loggposter.
 */
export function rivalShareTrading(s: GameState): LogEntry[] {
  const events: LogEntry[] = [];
  const phase = s.marketCycle?.phase ?? "stable";
  s.competitors = s.competitors.map((c) => {
    if (c.institutional) return c; // fonderna jagar fastigheter, inte aktier
    const nc: Competitor = { ...c, stockHoldings: [...(c.stockHoldings ?? [])] };

    // Sälj: bust-panik eller vinsthemtagning (>40 % upp).
    nc.stockHoldings = nc.stockHoldings!.filter((h) => {
      const st = s.stocks.find((x) => x.id === h.stockId);
      if (!st) return false;
      const gain = h.avgCost > 0 ? st.price / h.avgCost - 1 : 0;
      const sellChance = phase === "bust" ? 0.25 : gain > 0.4 ? 0.2 : 0.02;
      if (random01() >= sellChance) return true;
      const proceeds = Math.round(h.shares * st.price * 0.997);
      nc.cash += proceeds;
      if (h.stockId === "FBAB" && s.ipoShares && h.shares >= s.ipoShares.total * 0.02)
        events.push({
          t: `🏦 ${nc.name} sells its ${((h.shares / s.ipoShares.total) * 100).toFixed(1)}% stake in YOUR company (${msek(proceeds)}).`,
          kind: "event",
          rival: nc.name,
        });
      return false;
    });

    // Köp: strategi- och konjunkturstyrt.
    const appetite =
      (nc.strategy === "värde" || nc.strategy === "utdelning" ? 0.1 : 0.05) *
      (phase === "bust" ? 0.4 : phase === "boom" ? 1.3 : 1);
    if (nc.cash > 10_000_000 && random01() < appetite) {
      const candidates = s.stocks.filter(
        (st) => st.competitorName !== nc.name && (st.id !== "FBAB" || s.ipoActive),
      );
      const st = candidates.length ? pick(candidates) : null;
      if (st) {
        const budget = Math.min(nc.cash * 0.08, 20_000_000);
        let shares = Math.floor(budget / (st.price * 1.003));
        if (st.id === "FBAB" && s.ipoShares) {
          const { total, public: pub } = s.ipoShares;
          const activistSh = Math.round((total * (s.takeoverPressure ?? 0)) / 100);
          const otherRivalSh = rivalFbabShares(s) - fbabSharesOf(c);
          const held = fbabSharesOf(nc);
          const freeFloat = pub - activistSh - otherRivalSh - held - Math.ceil(total * 0.1);
          const singleCap = Math.floor(total * 0.1) - held; // max 10 % per rival
          shares = Math.max(0, Math.min(shares, freeFloat, singleCap));
        }
        if (shares > 0 && shares * st.price >= 500_000) {
          const cost = Math.round(shares * st.price * 1.003);
          nc.cash -= cost;
          const existing = nc.stockHoldings!.find((h) => h.stockId === st.id);
          if (existing) {
            existing.avgCost =
              (existing.avgCost * existing.shares + st.price * shares) / (existing.shares + shares);
            existing.shares += shares;
          } else {
            nc.stockHoldings!.push({ stockId: st.id, shares, avgCost: st.price });
          }
          if (st.id === "FBAB" && s.ipoShares) {
            const pct = (fbabSharesOf(nc) / s.ipoShares.total) * 100;
            if (pct >= 2)
              events.push({
                t: `🏦 ${nc.name} buys into YOUR company — now holds ${pct.toFixed(1)}% of the shares.`,
                kind: "event",
                rival: nc.name,
              });
          } else if (st.competitorName && shares / st.sharesOutstanding >= 0.05) {
            events.push({
              t: `🏦 ${nc.name} takes a ${((shares / st.sharesOutstanding) * 100).toFixed(0)}% position in ${st.name}.`,
              kind: "event",
              rival: nc.name,
            });
          }
        }
      }
    }
    return nc;
  });
  return events;
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
    // SPELARENS aktie prissätts av IPO-blocket i advanceMonth (eget kapital
    // per aktie) – den ska INTE slumpvandra här. Buggen: den här vandringen
    // satte FBAB:s targetPrice, dagssteget drog kursen dit (15 %/dag), och
    // kursen frikopplades helt från fundamenta – bolag värda miljarder
    // handlades till golvet $1 medan "kursen kollapsar"-larmen haglade.
    if (st.competitorName === "__player__") return st;
    // AVKNOPPNINGAR prissätts också fundamentalt (substans per aktie) – i
    // avknoppningsblocket i advanceMonth. Ingen slumpvandring här.
    if (st.spinOffId) return st;
    // RIVALAKTIER: ren substansprissättning (eget kapital per aktie) – ingen
    // slumpvandring där heller. Kursen andas ändå med konjunkturen eftersom
    // rivalens equity följer fastighetsvärden, kassa och innehav; nyhets-
    // och kvartalsknuffar ger tillfälliga avvikelser som dagssteget drar
    // tillbaka mot substansankaret.
    if (st.competitorName) {
      const c = competitors.find((x) => x.name === st.competitorName);
      if (c) {
        const book = Math.round(Math.max(0.5, c.equity / st.sharesOutstanding) * 100) / 100;
        dividends += (st.price * st.owned * st.dividendYield) / 12;
        return {
          ...st,
          monthClose: st.price,
          prevPrice: st.price,
          price: book,
          targetPrice: book,
          history: [...st.history, book].slice(-32),
        };
      }
      // Rivalen finns inte längre (uppköpt/fusionerad) → generisk vandring
      // tills avnoteringen städar bort aktien.
    }
    const noise = rnd(-st.volatility, st.volatility);
    const ret = st.drift + st.beta * sentReturn + sectorTrend[st.sector] + macroBias(st.sector, macro) + noise;
    let price = Math.max(1, st.price * (1 + ret));
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
        fills.push(`⚠️ Limit order cancelled – couldn't buy ${order.stockName}: insufficient cash.`);
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
        `✅ Limit order executed: Bought ${qty.toLocaleString("en-US")} shares in ${order.stockName} @ ${kr(stock.price)}.`,
      );
    } else {
      const qty = Math.min(order.qty, stock.owned);
      if (qty <= 0) {
        fills.push(`⚠️ Limit order cancelled – no shares to sell in ${order.stockName}.`);
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
        `✅ Limit order executed: Sold ${qty.toLocaleString("en-US")} shares in ${order.stockName} @ ${kr(stock.price)}.`,
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
    const beat = random01() < beatProb;
    const surprise = beat
      ? 1.0 + rnd(0.04, 0.18) // +4 till +18 %
      : 1.0 - rnd(0.04, 0.16); // −4 till −16 %
    const newPrice = Math.max(1, Math.round(st.price * surprise * 100) / 100);
    // EPS uppdateras med kvartalets utfall
    const newEps = st.eps !== undefined
      ? Math.max(0.01, Math.round(st.eps * (beat ? rnd(1.02, 1.10) : rnd(0.90, 0.98)) * 100) / 100)
      : st.eps;
    const newRating: "Buy" | "Hold" | "Sell" = beat
      ? (surprise > 1.10 ? "Buy" : "Hold")
      : (surprise < 0.92 ? "Sell" : "Hold");
    const notable = Math.abs(surprise - 1) > 0.08;
    const headline = `${st.name}: ${beat ? "beat" : "missed"} the quarterly forecast (${beat ? "+" : ""}${((surprise - 1) * 100).toFixed(0)}%)`;
    if (notable) events.push(`📊 ${headline}.`);
    return {
      ...st,
      price: newPrice,
      targetPrice: newPrice,
      eps: newEps,
      analystRating: newRating,
      targetKurs: newRating === "Buy" ? Math.round(newPrice * 1.15 * 100) / 100
                : newRating === "Sell" ? Math.round(newPrice * 0.90 * 100) / 100
                : st.targetKurs,
      history: [...st.history, newPrice].slice(-32),
      newsHistory: notable ? pushNews(st, headline, beat ? "up" : "down", date) : st.newsHistory,
    };
  });
  return { stocks: next, events };
}

export { COURTAGE };

/* ── Ägarkartan ───────────────────────────────────────────────────────────
   Vem äger vem, och hur mycket. Korsägandet byggs redan upp av
   rivalShareTrading ovan, men låg tidigare bara som siffror i tillståndet.
   Funktionerna nedan sammanställer det till en läsbar bild för UI:t.

   Ägare kan vara spelaren, en rival eller marknaden (floaten). Andelar
   räknas mot bolagets totala antal aktier – för spelarens eget bolag mot
   ipoShares.total, för noterade rivaler mot sharesOutstanding. */

export interface OwnerStake {
  /** Ägarens namn ("You" för spelaren, "Market" för floaten). */
  owner: string;
  kind: "player" | "rival" | "activist" | "market";
  shares: number;
  /** Andel av bolagets totala aktier, 0–1. */
  share: number;
  /** Marknadsvärde på posten. */
  value: number;
}

export interface CompanyOwnership {
  /** Bolaget som ägs. */
  stockId: string;
  name: string;
  /** true för spelarens eget noterade bolag. */
  isPlayer: boolean;
  totalShares: number;
  price: number;
  stakes: OwnerStake[];
}

/** Ägarbilden för ETT noterat bolag: alla kända ägare, störst först. */
export function ownershipOf(s: GameState, stock: Stock): CompanyOwnership {
  const isPlayer = stock.id === "FBAB";
  const total = isPlayer ? (s.ipoShares?.total ?? 0) : stock.sharesOutstanding;
  const stakes: OwnerStake[] = [];
  const add = (owner: string, kind: OwnerStake["kind"], shares: number) => {
    if (shares <= 0 || total <= 0) return;
    stakes.push({ owner, kind, shares, share: shares / total, value: shares * stock.price });
  };

  if (isPlayer) {
    // Spelarens egen post = totalen minus floaten.
    add("You", "player", total - (s.ipoShares?.public ?? 0));
    // Aktivistfonden anges i procent av totalen.
    add("Kronfelt Capital", "activist", Math.round((total * (s.takeoverPressure ?? 0)) / 100));
  } else {
    add("You", "player", stock.owned);
  }

  for (const c of s.competitors ?? []) {
    const sh = (c.stockHoldings ?? [])
      .filter((h) => h.stockId === stock.id)
      .reduce((a, h) => a + h.shares, 0);
    add(c.name, "rival", sh);
  }

  // Resten ligger hos marknaden.
  const known = stakes.reduce((a, x) => a + x.shares, 0);
  add("Market", "market", Math.max(0, total - known));

  stakes.sort((a, b) => b.shares - a.shares);
  return { stockId: stock.id, name: stock.name, isPlayer, totalShares: total, price: stock.price, stakes };
}

/** Ägarbilden för alla noterade bolag (spelarens eget först om det är noterat). */
export function ownershipMap(s: GameState): CompanyOwnership[] {
  const listed = (s.stocks ?? []).filter((st) => st.id !== "FBAB" || s.ipoActive);
  return listed
    .map((st) => ownershipOf(s, st))
    .sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || b.totalShares * b.price - a.totalShares * a.price);
}

/** Vad ETT bolag äger i andra – motsatt riktning mot ownershipOf. */
export function holdingsOfOwner(s: GameState, owner: string): OwnerStake[] {
  const out: OwnerStake[] = [];
  const push = (st: Stock, shares: number) => {
    const total = st.id === "FBAB" ? (s.ipoShares?.total ?? 0) : st.sharesOutstanding;
    if (shares <= 0 || total <= 0) return;
    out.push({ owner: st.name, kind: "rival", shares, share: shares / total, value: shares * st.price });
  };
  if (owner === "You") {
    for (const st of s.stocks ?? []) if (st.id !== "FBAB") push(st, st.owned);
  } else {
    const c = (s.competitors ?? []).find((x) => x.name === owner);
    for (const h of c?.stockHoldings ?? []) {
      const st = (s.stocks ?? []).find((x) => x.id === h.stockId);
      if (st) push(st, h.shares);
    }
  }
  return out.sort((a, b) => b.value - a.value);
}
