/* ============================================================
   Initialt speltillstånd – en ändlig värld med 100 fastigheter
   fördelade mellan marknaden, konkurrenter och en off-market pool.
   ============================================================ */

import { DEFAULT_COMPANY_NAME } from "./company";
import { AI_NAMES, DISTRICTS } from "./data";
import { calcCapacity, genLot, genWorldProperty, makeTenant } from "./generators";
import { rnd } from "./random";
import { initStocks } from "./stocks";
import { makeIndustryAssetFromTemplate } from "./industries";
import { INDUSTRY_TEMPLATES } from "./industryData";
import type { Competitor, CompetitorAgenda, CompetitorStrategy, GameState, IndustryAsset, Property } from "./types";

const WORLD_SIZE = 190;

/** Skapar ett nytt speltillstånd med en ändlig fastighetsmarknad. */
export function initState(): GameState {
  const base: GameState = {
    day: 1, // 1 januari (spelår 1 = kalenderår 2000, se engine/date.ts)
    month: 1,
    year: 1,
    cash: 5_000_000,
    debt: 0,
    interestRate: 2.5,
    marketMod: 1.0,
    demandMod: 1.0,
    taxMod: 1.0,
    reputation: 50,
    portfolio: [],
    listings: [],
    lots: [],
    competitors: [],
    log: [{ t: "Du startar med 5 MSEK eget kapital. Lycka till!", kind: "info" }],
    history: [{ month: 0, equity: 5_000_000 }],
    gameOver: false,
    offers: [],
    pendingDecision: null,
    stocks: [],
    marketSentiment: 1.0,
    sentimentHistory: [1.0],
    subsidiaries: [],
    dividendsReceived: 0,
    districtDev: { centrum: 1, finans: 1, innerstad: 1, hamnen: 1, industri: 1, förort: 1, kulle: 1 },
    buildCostMod: 1,
    researchDone: [],
    activeResearch: null,
    staff: {},
    stockOrders: [],
    portfolioValueHistory: [0],
    worldPool: [],
    worldTotal: WORLD_SIZE,
    industryPortfolio: [],
    industryListings: [],
    energyOwnedMW: 0,
    hotelHighOccConsecutiveMonths: 0,
    companyName: DEFAULT_COMPANY_NAME,
    companyLevel: 1,
  };

  // ── Generera hela världen (WORLD_SIZE fastigheter) ──────────────
  const allProps: Property[] = [];
  for (let i = 0; i < WORLD_SIZE; i++) allProps.push(genWorldProperty(base));

  // ── Skapa konkurrenter ──────────────────────────────────────────
  // Varje konkurrent får ~10 fastigheter från världspoolen.
  const compPortfolioSize = 10;
  const STRATEGIES: CompetitorStrategy[] = ["tillväxt", "utdelning", "värde", "distrikt"];
  const competitors: Competitor[] = AI_NAMES.map((n, i) => {
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const preferredDistrict = strategy === "distrikt" ? DISTRICTS[i % DISTRICTS.length].id : undefined;
    return {
      name: n,
      cash: rnd(2, 6) * 1e6,
      units: 0,
      equity: 0,
      portfolio: [],
      strategy,
      preferredDistrict,
      agenda: agendaFor(strategy, preferredDistrict),
    };
  });

  let propIdx = 0;
  for (const c of competitors) {
    const slice = allProps.slice(propIdx, propIdx + compPortfolioSize);
    c.portfolio = slice.map((p) => ({ ...p, owned: false }));
    c.units = c.portfolio.length;
    const portVal = c.portfolio.reduce((a, p) => a + p.askPrice, 0);
    c.equity = c.cash + portVal;
    c.monthlyNOI = Math.round((portVal * 0.06) / 12);
    propIdx += compPortfolioSize;
  }
  base.competitors = competitors;

  // ── 10 fastigheter till salu (listings) ─────────────────────────
  // Garantera instegsobjekt: de tre billigaste skalas ned till en handpenning
  // startkassan klarar. Skalning bevarar direktavkastningen (yta, pris och hyra
  // skalas ihop) och är robust även när prisnivån lyfter hela golvet – en
  // ren generate-och-hoppas-loop kunde annars misslyckas och lämna spelaren
  // utan något köpbart objekt.
  const listingProps = allProps.slice(propIdx, propIdx + 10);
  propIdx += 10;
  const AFFORDABLE = 9_000_000;
  const scaleToPrice = (p: Property, target: number): Property => {
    if (p.askPrice <= target) return p;
    const f = target / p.askPrice;
    const area = Math.max(120, Math.round(p.area * f));
    return {
      ...p,
      area,
      askPrice: Math.round(p.askPrice * f),
      baseRent: Math.round(p.baseRent * f),
      capacity: calcCapacity(area, p.wholeBlock),
    };
  };
  const cheapest = [...listingProps].sort((a, b) => a.askPrice - b.askPrice).slice(0, 3);
  for (const p of cheapest) {
    const idx = listingProps.indexOf(p);
    const scaled = scaleToPrice(p, AFFORDABLE);
    // Instegsobjekten är nyckelfärdiga: fullt uthyrda så det första förvärvet
    // ger stabilt kassaflöde direkt i stället för ett vakant småobjekt som
    // bara blöder tills det råkar hyras ut.
    const tenants = Array.from({ length: scaled.capacity }, () =>
      makeTenant(scaled.baseRent / scaled.capacity, base.demandMod, scaled.condition),
    );
    listingProps[idx] = { ...scaled, tenants };
  }
  base.listings = listingProps.map((p) => toListingProp(p, base));

  // ── Resten går till off-market poolen ────────────────────────────
  base.worldPool = allProps.slice(propIdx).map((p) => ({ ...p, owned: false }));

  // ── Tomter ──────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) base.lots.push(genLot(base));

  // ── Aktier ──────────────────────────────────────────────────────
  base.stocks = initStocks(base.competitors);

  // ── Industrimarknadslistor (5 slumpmässiga från INDUSTRY_TEMPLATES) ─
  const shuffled = [...INDUSTRY_TEMPLATES].sort(() => Math.random() - 0.5);
  const industryListings: IndustryAsset[] = [];
  let indId = 2000;
  for (const tmpl of shuffled.slice(0, 5)) {
    industryListings.push(makeIndustryAssetFromTemplate(tmpl, indId++, base));
  }
  base.industryListings = industryListings;

  return base;
}

/** Rivalens långsiktiga agenda utifrån strategin – syns i Topp-listan. */
export function agendaFor(
  strategy: CompetitorStrategy,
  preferredDistrict?: string,
): CompetitorAgenda {
  switch (strategy) {
    case "distrikt": {
      const d = DISTRICTS.find((x) => x.id === preferredDistrict);
      return {
        kind: "district",
        district: preferredDistrict,
        target: 12,
        label: `vill dominera ${d?.name ?? "sitt distrikt"} (12 fastigheter)`,
      };
    }
    case "tillväxt":
      return { kind: "units", target: 25, label: "vill äga 25 fastigheter" };
    case "värde":
      return { kind: "equity", target: 120_000_000, label: "jagar 120 MSEK i eget kapital" };
    default:
      return { kind: "equity", target: 80_000_000, label: "bygger kassaflöde mot 80 MSEK" };
  }
}

function toListingProp(p: Property, state: GameState): Property {
  const born = state.year * 12 + state.month;
  return {
    ...p,
    owned: false,
    listedMonth: born,
    expiresMonth: born + 3 + Math.floor(Math.random() * 2),
  };
}
