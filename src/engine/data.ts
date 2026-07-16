/* ============================================================
   Speldata – konstanter för Fastighetsimperium.
   Balansering och formler är oförändrade från prototypen.
   ============================================================ */

import type {
  District,
  GameEvent,
  PropTypeDef,
  PropTypeKey,
  TenantProfile,
  Upgrade,
} from "./types";

export const DISTRICTS: District[] = [
  { id: "centrum",   name: "Downtown",           base: 32000, growth: 1.0,  demand: 1.00, prestige: 1.4 },
  { id: "finans",    name: "Financial District", base: 44000, growth: 1.15, demand: 1.05, prestige: 1.7 },
  { id: "innerstad", name: "Inner City",         base: 26000, growth: 1.1,  demand: 1.00, prestige: 1.2 },
  { id: "hamnen",    name: "The Harbor",         base: 21000, growth: 1.25, demand: 0.85, prestige: 1.1 },
  { id: "industri",  name: "Industrial District",base: 11000, growth: 0.9,  demand: 0.75, prestige: 0.7 },
  { id: "förort",    name: "The Suburbs",        base: 15000, growth: 1.1,  demand: 0.90, prestige: 0.9 },
  { id: "kulle",     name: "Villa Hill",         base: 28000, growth: 1.05, demand: 0.95, prestige: 1.3 },
];

/**
 * Generationsprofil per distrikt: vilka fastighetstyper som byggs där,
 * typisk storlek, och om objekt säljs som HELA KVARTER (förortsmodellen:
 * en fastighet = ett kvarter med flera huskroppar och fler hyresplatser).
 * weight styr hur ofta distriktet dras vid världsgenerering (~tomtantal).
 */
export interface DistrictGenProfile {
  types: [PropTypeKey, number][];
  areaMin: number;
  areaMax: number;
  wholeBlock?: boolean;
  weight: number;
  /** Prisgolv (kr): objekt under golvet växer i yta tills de når det.
   *  I Finansdistriktet finns inga små billiga hus – bara storskaliga torn. */
  minPrice?: number;
}

export const DISTRICT_GEN: Record<string, DistrictGenProfile> = {
  centrum:   { types: [["kontor", 45], ["butik", 25], ["bostad", 30]], areaMin: 800,  areaMax: 3500, weight: 25 },
  finans:    { types: [["kontor", 85], ["butik", 15]],                 areaMin: 4000, areaMax: 12000, weight: 9, minPrice: 250_000_000 },
  innerstad: { types: [["bostad", 45], ["butik", 30], ["kontor", 25]], areaMin: 600,  areaMax: 2500, weight: 27 },
  hamnen:    { types: [["industri", 40], ["kontor", 35], ["butik", 25]], areaMin: 800, areaMax: 4000, weight: 9 },
  industri:  { types: [["industri", 85], ["kontor", 15]],              areaMin: 1500, areaMax: 7000, weight: 9 },
  förort:    { types: [["bostad", 80], ["butik", 20]],                 areaMin: 2800, areaMax: 6000, wholeBlock: true, weight: 8 },
  kulle:     { types: [["bostad", 90], ["butik", 10]],                 areaMin: 300,  areaMax: 900,  weight: 13 },
};

/*
 * Balanserade yields (vid 70 % LTV, ränta ~4 %):
 *   Bostad:  ~5 % direktavk., låg vakans  → stabil, låg risk
 *   Industri: ~5,5 % direktavk., medellång kontrakt → kassaflödesstabil
 *   Kontor:  ~6 % direktavk., hög vakans → risk/yield-avvägning
 *   Butik:   ~7 % direktavk., högst vakans → maximal yield, högst risk
 */
export const PROP_TYPES: Record<PropTypeKey, PropTypeDef> = {
  bostad: {
    label: "Residential",
    rentFactor: 0.0050,   // was 0.0042 → +19 %
    opexFactor: 0.23,     // was 0.28  → −18 %
    vacancyBase: 0.04,    // oförändrad (stabil boendemarknad)
    buildCostM2: 18000,   // was 24000 → bygg lönsamt i rätt distrikt
    buildMonths: 10,
  },
  kontor: {
    label: "Office",
    rentFactor: 0.0060,   // 0.0055→0.0060: högre vakans (10 %) ska ge högre yield
    opexFactor: 0.26,     // was 0.32  → −19 %
    vacancyBase: 0.10,    // oförändrad (kontorsmarknaden rörlig)
    buildCostM2: 22000,   // was 28000
    buildMonths: 12,
  },
  butik: {
    label: "Retail",
    rentFactor: 0.0068,   // 0.0060→0.0068: högst vakans (13 %) ⇒ högst yield/risk
    opexFactor: 0.23,     // was 0.30  → −23 %
    vacancyBase: 0.13,    // was 0.12  (lite svårare att fylla)
    buildCostM2: 20000,   // was 26000
    buildMonths: 11,
  },
  industri: {
    label: "Industrial/Warehouse",
    rentFactor: 0.0052,   // 0.0050→0.0052: medelrisk ⇒ yield mellan bostad och kontor
    opexFactor: 0.17,     // was 0.22  → −23 % (enkla lokaler)
    vacancyBase: 0.07,    // was 0.08
    buildCostM2: 10000,   // was 14000 → lönsamt att bygga
    buildMonths: 8,
  },
};

export const UPGRADES: Upgrade[] = [
  {
    id: "renovering",
    name: "Renovation",
    cost: 0.12,
    rentBoost: 0.18,
    condBoost: 35,
    months: 2,
    desc: "Raises rent and condition.",
  },
  {
    id: "energi",
    name: "Energy retrofit",
    cost: 0.08,
    opexCut: 0.2,
    condBoost: 10,
    months: 1,
    desc: "Lowers operating costs.",
  },
  {
    id: "tillbygg",
    name: "Extension",
    cost: 0.22,
    valueBoost: 0.25,
    rentBoost: 0.1,
    months: 3,
    desc: "Increases floor area and value.",
  },
  { id: "smart", name: "Smart building", cost: 0.06, vacancyCut: 0.3, months: 1, desc: "Lowers vacancy." },
];

// Hyresgästprofiler (kvalitet påverkar hyra, kontraktslängd, risk)
export const TENANT_PROFILES: TenantProfile[] = [
  {
    id: "stat",
    name: "Government agency",
    quality: 1.15,
    termMin: 60,
    termMax: 120,
    defaultRisk: 0.002,
  },
  {
    id: "kedja",
    name: "Established chain",
    quality: 1.08,
    termMin: 36,
    termMax: 84,
    defaultRisk: 0.006,
  },
  { id: "smb", name: "Small business", quality: 1.0, termMin: 24, termMax: 60, defaultRisk: 0.018 },
  {
    id: "privat",
    name: "Private individual",
    quality: 0.97,
    termMin: 12,
    termMax: 36,
    defaultRisk: 0.012,
  },
  { id: "startup", name: "Startup", quality: 1.05, termMin: 12, termMax: 36, defaultRisk: 0.035 },
];

export const EVENTS: GameEvent[] = [
  {
    id: "rate_up",
    text: "The central bank raises the policy rate by 0.25%. Rental demand cools and the market softens.",
    apply: (s) => ({
      ...s,
      interestRate: +(s.interestRate + 0.25).toFixed(2),
      demandMod: +(s.demandMod * 0.98).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.985).toFixed(3),
    }),
  },
  {
    id: "rate_down",
    text: "The central bank cuts the policy rate by 0.25%. The investment climate and the market lift.",
    apply: (s) => ({
      ...s,
      interestRate: Math.max(0.5, +(s.interestRate - 0.25).toFixed(2)),
      demandMod: +(s.demandMod * 1.02).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.015).toFixed(3),
    }),
  },
  {
    id: "boom",
    text: "Boom! Market values, rental demand and the stock market all rise.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.06).toFixed(3),
      demandMod: +(s.demandMod * 1.03).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.04).toFixed(3),
    }),
  },
  {
    id: "bust",
    text: "Recession. Market values fall, demand drops and the stock market slides.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 0.94).toFixed(3),
      demandMod: +(s.demandMod * 0.97).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.95).toFixed(3),
    }),
  },
  {
    id: "tenant_demand",
    text: "Rising migration into the city. Rental demand climbs sharply.",
    apply: (s) => ({
      ...s,
      demandMod: +(s.demandMod * 1.05).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.01).toFixed(3),
    }),
  },
  {
    id: "tax",
    text: "A property tax hike is announced.",
    apply: (s) => ({
      ...s,
      taxMod: +(s.taxMod * 1.04).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.99).toFixed(3),
    }),
  },
  {
    id: "pr",
    text: "Positive press about your company. Reputation +5.",
    apply: (s) => ({ ...s, reputation: Math.min(100, s.reputation + 5) }),
  },
  {
    id: "ravarubrist",
    text: "Materials shortage! Building materials get pricier for a while.",
    apply: (s) => ({ ...s, buildCostMod: +(((s.buildCostMod ?? 1) * 1.3)).toFixed(3) }),
  },
  {
    id: "hyresreglering",
    text: "New rules: tighter rent control dampens demand.",
    apply: (s) => ({
      ...s,
      demandMod: +(s.demandMod * 0.95).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.99).toFixed(3),
    }),
  },
];

/** Sällsynta chockhändelser — triggas separat med ~3 % sannolikhet/månad. */
export const RARE_EVENTS: GameEvent[] = [
  {
    id: "kris",
    text: "Financial crisis! Market values crash, the stock market plunges and tenants leave.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 0.88).toFixed(3),
      demandMod: +(s.demandMod * 0.88).toFixed(3),
      interestRate: +(s.interestRate + 0.5).toFixed(2),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.80).toFixed(3),
    }),
  },
  {
    id: "rally",
    text: "Property boom! Prices, rental demand and the stock market surge.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.10).toFixed(3),
      demandMod: +(s.demandMod * 1.06).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.12).toFixed(3),
    }),
  },
  {
    id: "recession",
    text: "Financial crisis! A downturn squeezes tenants for the next 3 months. Default risk rises sharply.",
    apply: (s) => ({ ...s, recessionMonthsLeft: 3, marketMod: +(s.marketMod * 0.88).toFixed(3), demandMod: +(s.demandMod * 0.92).toFixed(3) }),
  },
];

/** Lokala distriktshändelser – en händelse per distrikt med ~8 % chans/mån. */
export const DISTRICT_EVENTS: GameEvent[] = [
  {
    id: "tunnelbana",
    text: "A new metro station is planned. The district's appeal rises.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 1.03).toFixed(3) }),
  },
  {
    id: "byggstörning",
    text: "A large construction project causes disruption. Temporary rise in vacancy.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 0.97).toFixed(3) }),
  },
  {
    id: "stadsfornyelese",
    text: "Urban renewal in the district draws new residents and businesses.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.02).toFixed(3),
      demandMod: +(s.demandMod * 1.02).toFixed(3),
    }),
  },
  {
    id: "oversv",
    text: "Flood risk in the coastal area. Property values dip temporarily.",
    apply: (s) => ({ ...s, marketMod: +(s.marketMod * 0.98).toFixed(3) }),
  },
  {
    id: "brottsvag",
    text: "Rising crime is reported. Rental demand falls locally.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 0.97).toFixed(3) }),
  },
];

/** Milstolpar – låser upp belöningar och berättar spelarprogress. */
export interface MilestoneDef {
  id: string;
  title: string;
  desc: string;
  check: (s: import("./types").GameState) => boolean;
  reward: string;
}

export const MILESTONES: MilestoneDef[] = [
  { id: "first_buy",    title: "First acquisition",     desc: "Buy your first property.",                          check: (s) => s.portfolio.length >= 1,                                   reward: "Reputation +3" },
  { id: "first_office", title: "Office debut",          desc: "Own an office property.",                           check: (s) => s.portfolio.some((p) => p.type === "kontor"),              reward: "Access to the Investment Bank" },
  { id: "5props",       title: "Estate agent",          desc: "Own at least 5 completed properties.",              check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 5, reward: "Reputation +5" },
  { id: "first_10m",    title: "The 10 Million Club",   desc: "Reach 10 MSEK in equity.",                          check: (s) => (s.cash + s.portfolio.reduce((a, p) => a + p.askPrice, 0) - s.debt) >= 10_000_000, reward: "Reputation +5" },
  { id: "district_dom", title: "District leader",       desc: "Own the most properties in a district.",            check: (s) => checkDistrictLead(s),                                      reward: "District appeal +5%" },
  { id: "first_build",  title: "The developer",         desc: "Build your first property from scratch.",           check: (s) => s.portfolio.some((p) => (p.txHistory ?? []).some((t) => t.type === "built")), reward: "Build time −1 month" },
  { id: "no_debt",      title: "Debt-free",             desc: "Hold zero debt with at least 3 properties.",        check: (s) => s.debt === 0 && s.portfolio.length >= 3,                   reward: "Reputation +10" },
  { id: "50_rep",       title: "Established name",       desc: "Reach 50 reputation.",                              check: (s) => s.reputation >= 50,                                        reward: "Rate discount via a better lender" },
  { id: "50m_equity",   title: "Property empire",       desc: "Reach 50 MSEK in equity.",                          check: (s) => (s.cash + s.portfolio.reduce((a, p) => a + p.askPrice, 0) - s.debt) >= 50_000_000, reward: "Reputation +15" },
  { id: "full_coverage",title: "Citywide",              desc: "Own properties in at least 5 of the city's 7 districts.", check: (s) => new Set(s.portfolio.map((p) => p.district)).size >= 5,     reward: "District diversification −5% vacancy" },
];

function checkDistrictLead(s: import("./types").GameState): boolean {
  const counts: Record<string, number> = {};
  for (const p of s.portfolio) counts[p.district] = (counts[p.district] ?? 0) + 1;
  for (const d of Object.keys(counts)) {
    const rivalMax = Math.max(0, ...s.competitors.map((c) => (c.portfolio ?? []).filter((p) => p.district === d).length));
    if (counts[d] > rivalMax) return true;
  }
  return false;
}

/** Politiska partier – kommunalval var 4:e år. */
export interface PoliticalParty {
  id: string;
  name: string;
  desc: string;
  apply: (s: import("./types").GameState) => import("./types").GameState;
}

export const POLITICAL_PARTIES: PoliticalParty[] = [
  {
    id: "rödgrön",
    name: "Red-Green coalition",
    desc: "Tighter rent control and higher property tax.",
    apply: (s) => ({ ...s, taxMod: +(s.taxMod * 1.06).toFixed(3), demandMod: +(s.demandMod * 0.96).toFixed(3) }),
  },
  {
    id: "borgerlig",
    name: "Center-right majority",
    desc: "Lower property tax and easier building permits.",
    apply: (s) => ({ ...s, taxMod: +(s.taxMod * 0.95).toFixed(3), buildCostMod: +((s.buildCostMod ?? 1) * 0.92).toFixed(3) }),
  },
  {
    id: "mittenkoalition",
    name: "Centrist coalition",
    desc: "Stable politics. No dramatic changes.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 1.01).toFixed(3) }),
  },
];

export const AI_NAMES = [
  "Nordhem Properties",
  "Brunnspark Invest",
  "Coastline Ltd",
  "City Core Group",
  "Harborview Capital",
  "Silverberg & Partners",
  "Lundqvist Properties",
];

/** Affärsnamn per hyresgästprofil – ger varje kontrakt en egen identitet. */
export const TENANT_NAMES: Record<string, string[]> = {
  stat: ["Tax Authority", "Social Insurance Office", "Land Registry", "Employment Agency", "Migration Board"],
  kedja: ["Corner Grocer", "Espresso House", "City Pharmacy", "Liquor Store", "Handy Hardware", "News Kiosk", "Home Textiles"],
  smb: ["Café Fortune", "Berg & Co Accounting", "Northside Dental", "Studio Form", "Pagina Bookshop", "Saxon Hair Salon"],
  privat: ["The Anderson Family", "The Lindquist Family", "Eric & Sophie", "The Oberg Family", "The Holm Family"],
  startup: ["Pixelplay Inc", "Greenmile Tech", "Fjord Analytics", "Loopa", "Nordbyte", "Tindra Studio"],
};
