/* ============================================================
   Initialt speltillstånd – en ändlig värld med 100 fastigheter
   fördelade mellan marknaden, konkurrenter och en off-market pool.
   ============================================================ */

import { DEFAULT_COMPANY_NAME } from "./company";
import { AI_NAMES, DISTRICTS, SMALL_AI_NAMES } from "./data";
import { builtYearFor, calcCapacity, energyClassFor, genListing, genLot, genWorldProperty, makeTenant } from "./generators";
import { random01, rnd } from "./random";
import { initStocks } from "./stocks";
import { makeIndustryAssetFromTemplate } from "./industries";
import { INDUSTRY_TEMPLATES } from "./industryData";
import type { Competitor, CompetitorAgenda, CompetitorStrategy, GameState, InitOptions, IndustryAsset, Property } from "./types";

const WORLD_SIZE = 190;

/** Skapar ett nytt speltillstånd med en ändlig fastighetsmarknad.
 *  `opts` (svårighet/Friläge-anpassningar) styr startkapital, ränta
 *  och rivalernas antal/styrka – utelämnat = spelets grundbalans. */
export function initState(opts?: InitOptions): GameState {
  const startCash = opts?.cash ?? 7_000_000;
  const startRate = opts?.interestRate ?? 2.5;
  const rivalStrength = opts?.rivalStrength ?? 1;
  // Partiets slumpfrö: bevaras så partiet kan reproduceras från start.
  const seed = (opts?.seed ?? (Date.now() >>> 0)) >>> 0;
  const base: GameState = {
    seed,
    // Stadskartans frö följer partiet (0/utelämnat = klassiska kartan).
    ...(opts?.citySeed ? { citySeed: opts.citySeed } : {}),
    rng: seed,
    day: 1, // 1 januari (spelår 1 = kalenderår 2000, se engine/date.ts)
    month: 1,
    year: 1,
    cash: startCash,
    debt: 0,
    interestRate: startRate,
    marketMod: 1.0,
    demandMod: 1.0,
    taxMod: 1.0,
    reputation: 50,
    portfolio: [],
    listings: [],
    lots: [],
    competitors: [],
    log: [
      {
        t: `You start with $${(startCash / 1e6).toLocaleString("en-US")}M in equity${
          opts?.difficulty && opts.difficulty !== "normal" ? ` (difficulty: ${opts.difficulty})` : ""
        }. Good luck!`,
        kind: "info",
      },
    ],
    history: [{ month: 0, equity: startCash }],
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
  // Varje konkurrent får ~10 fastigheter från världspoolen; svårigheten
  // skalar både antal (rivalCount) och styrka (kassa + portföljstorlek).
  const rivalNames = AI_NAMES.slice(0, Math.max(0, Math.min(AI_NAMES.length, opts?.rivalCount ?? AI_NAMES.length)));
  const compPortfolioSize = Math.max(3, Math.round(10 * rivalStrength));
  const STRATEGIES: CompetitorStrategy[] = ["tillväxt", "utdelning", "värde", "distrikt"];
  const competitors: Competitor[] = rivalNames.map((n, i) => {
    const strategy = STRATEGIES[i % STRATEGIES.length];
    const preferredDistrict = strategy === "distrikt" ? DISTRICTS[i % DISTRICTS.length].id : undefined;
    return {
      name: n,
      cash: rnd(2, 6) * 1e6 * rivalStrength,
      units: 0,
      equity: 0,
      portfolio: [],
      strategy,
      preferredDistrict,
      agenda: agendaFor(strategy, preferredDistrict),
    };
  });

  // ── Uppstickarna: små, onoterade lokalbolag (fas 4) ─────────────
  // 2–3 hus, tunn kassa och hög belåning: hungriga utmanare som kan växa
  // till fullvärdiga rivaler – eller bli byten i den motivdrivna M&A:n.
  const smallCount = Math.min(
    SMALL_AI_NAMES.length,
    Math.max(0, Math.round(((opts?.rivalCount ?? AI_NAMES.length) * SMALL_AI_NAMES.length) / AI_NAMES.length)),
  );
  const SMALL_STRATEGIES: CompetitorStrategy[] = ["distrikt", "värde", "tillväxt", "utdelning"];
  const smallRivals: Competitor[] = SMALL_AI_NAMES.slice(0, smallCount).map((n, i) => {
    const strategy = SMALL_STRATEGIES[i % SMALL_STRATEGIES.length];
    const preferredDistrict = strategy === "distrikt" ? "förort" : undefined;
    return {
      name: n,
      cash: rnd(0.8, 2) * 1e6 * rivalStrength,
      units: 0,
      equity: 0,
      portfolio: [],
      strategy,
      preferredDistrict,
      agenda: agendaFor(strategy, preferredDistrict),
      small: true,
    };
  });

  let propIdx = 0;
  for (const c of [...competitors, ...smallRivals]) {
    const size = c.small ? 2 + (SMALL_AI_NAMES.indexOf(c.name) % 2) : compPortfolioSize;
    const slice = allProps.slice(propIdx, propIdx + size);
    c.portfolio = slice.map((p) => ({ ...p, owned: false }));
    c.units = c.portfolio.length;
    const portVal = c.portfolio.reduce((a, p) => a + p.askPrice, 0);
    // Riktiga balansräkningar (rivalFinance.ts): beståndet är delvis belånat
    // från start – räntehöjningar biter på rivalerna från dag ett.
    // Uppstickarna är högst belånade: hungriga, och därmed räntekänsligast.
    const startLtv = c.small
      ? 0.55
      : c.strategy === "tillväxt" ? 0.5 : c.strategy === "distrikt" ? 0.45 : c.strategy === "utdelning" ? 0.35 : 0.3;
    c.debt = Math.round(portVal * startLtv);
    c.equity = c.cash + portVal - c.debt;
    c.monthlyNOI = Math.round((portVal * 0.06) / 12);
    propIdx += size;
  }
  base.competitors = [...competitors, ...smallRivals];

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
  // Tre distinkta instegsobjekt så det första valet blir en strategifråga –
  // inte tre likadana nyckelfärdiga hus:
  //  · Kassaflöde: nyskick, fullt uthyrt → stabil intäkt direkt, liten uppsida.
  //  · Nedgånget: eftersatt skick, tomt → billigt renoveringsobjekt (blöder
  //    tills det rustas och hyrs ut, men stor värdeuppsida).
  //  · Mix: halvbra skick, uthyrt → lite av båda (intäkt nu + renoveringspotential).
  const cf = (cond: number) => 0.6 + (cond / 100) * 0.6;
  const applyArchetype = (p: Property, cond: number, tenantCount: (cap: number) => number): Property => {
    // Prisa om efter det nya skicket (condFactor) så värderingen förblir rättvis
    // – ett nedgånget hus SKA vara billigare, inte gratis eget kapital.
    const ratio = cf(cond) / cf(p.condition);
    let sp: Property = {
      ...p,
      condition: cond,
      askPrice: Math.round(p.askPrice * ratio),
      baseRent: Math.round(p.baseRent * ratio),
      energyClass: energyClassFor(cond),
      builtYear: builtYearFor(cond, base.year),
    };
    sp = scaleToPrice(sp, AFFORDABLE);
    const n = Math.min(sp.capacity, tenantCount(sp.capacity));
    const tenants = Array.from({ length: n }, () =>
      makeTenant(sp.baseRent / sp.capacity, base.demandMod, cond),
    );
    return { ...sp, tenants };
  };
  const specs: [number, (cap: number) => number][] = [
    [84, (cap) => cap],                            // kassaflöde: fullt uthyrt
    [26, () => 0],                                 // nedgånget: tomt
    [58, (cap) => Math.max(1, Math.round(cap / 2))], // mix: delvis uthyrt
  ];
  // Instegsobjekten ligger ALLTID i Villakullen – småskaligt, billigt och
  // överblickbart: ett naturligt startområde att lära sig spelet i innan
  // stenstaden och Finansdistriktet lockar. De ersätter de tre billigaste
  // slumpade annonserna.
  const kulleAllowed = new Set(["kulle"]);
  const byPrice = [...listingProps].sort((a, b) => a.askPrice - b.askPrice).slice(0, 3);
  byPrice.forEach((p, i) => {
    const [cond, fill] = specs[i] ?? specs[0];
    const starter = genListing(base, kulleAllowed);
    listingProps[listingProps.indexOf(p)] = applyArchetype(starter, cond, fill);
  });
  base.listings = listingProps.map((p) => toListingProp(p, base));

  // ── Resten går till off-market poolen ────────────────────────────
  base.worldPool = allProps.slice(propIdx).map((p) => ({ ...p, owned: false }));

  // ── Tomter ──────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) base.lots.push(genLot(base));

  // ── Aktier ──────────────────────────────────────────────────────
  // Uppstickarna är privata familjebolag – bara de stora är börsnoterade.
  base.stocks = initStocks(base.competitors.filter((c) => !c.small));

  // ── Industrimarknadslistor (5 slumpmässiga från INDUSTRY_TEMPLATES) ─
  const shuffled = [...INDUSTRY_TEMPLATES].sort(() => random01() - 0.5);
  const industryListings: IndustryAsset[] = [];
  let indId = 2000;
  for (const tmpl of shuffled.slice(0, 5)) {
    industryListings.push(makeIndustryAssetFromTemplate(tmpl, indId++, base));
  }
  base.industryListings = industryListings;

  // ── Inställningar som simuleringen läser varje månad ─────────────
  if (opts && (opts.difficulty || opts.calmMode || opts.noBankruptcy)) {
    base.settings = {
      difficulty: opts.difficulty ?? "custom",
      ...(opts.calmMode ? { calmMode: true } : {}),
      ...(opts.noBankruptcy ? { noBankruptcy: true } : {}),
    };
  }

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
        label: `wants to dominate ${d?.name ?? "its district"} (12 properties)`,
      };
    }
    case "tillväxt":
      return { kind: "units", target: 25, label: "wants to own 25 properties" };
    case "värde":
      return { kind: "equity", target: 120_000_000, label: "chasing $120M in equity" };
    default:
      return { kind: "equity", target: 80_000_000, label: "building cash flow toward $80M" };
  }
}

function toListingProp(p: Property, state: GameState): Property {
  const born = state.year * 12 + state.month;
  return {
    ...p,
    owned: false,
    listedMonth: born,
    expiresMonth: born + 3 + Math.floor(random01() * 2),
  };
}
