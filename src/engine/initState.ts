/* ============================================================
   Initialt speltillstånd – en ändlig värld med 100 fastigheter
   fördelade mellan marknaden, konkurrenter och en off-market pool.
   ============================================================ */

import { AI_NAMES, DISTRICTS } from "./data";
import { genLot, genWorldProperty } from "./generators";
import { rnd } from "./random";
import { initStocks } from "./stocks";
import type { Competitor, CompetitorStrategy, GameState, Property } from "./types";

const WORLD_SIZE = 150;

/** Skapar ett nytt speltillstånd med en ändlig fastighetsmarknad. */
export function initState(): GameState {
  const base: GameState = {
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
    districtDev: { centrum: 1, hamnen: 1, industri: 1, förort: 1, kulle: 1 },
    buildCostMod: 1,
    researchDone: [],
    activeResearch: null,
    staff: {},
    stockOrders: [],
    portfolioValueHistory: [0],
    worldPool: [],
    worldTotal: WORLD_SIZE,
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
    return { name: n, cash: rnd(2, 6) * 1e6, units: 0, equity: 0, portfolio: [], strategy, preferredDistrict };
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
  const listingProps = allProps.slice(propIdx, propIdx + 10);
  base.listings = listingProps.map((p) => toListingProp(p, base));
  propIdx += 10;

  // ── Resten går till off-market poolen ────────────────────────────
  base.worldPool = allProps.slice(propIdx).map((p) => ({ ...p, owned: false }));

  // ── Tomter ──────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) base.lots.push(genLot(base));

  // ── Aktier ──────────────────────────────────────────────────────
  base.stocks = initStocks(base.competitors);

  return base;
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
