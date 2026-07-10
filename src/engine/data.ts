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
  { id: "centrum",   name: "Centrum",          base: 32000, growth: 1.0,  demand: 1.00, prestige: 1.4 },
  { id: "finans",    name: "Finansdistriktet", base: 44000, growth: 1.15, demand: 1.05, prestige: 1.7 },
  { id: "innerstad", name: "Innerstaden",      base: 26000, growth: 1.1,  demand: 1.00, prestige: 1.2 },
  { id: "hamnen",    name: "Hamnen",           base: 21000, growth: 1.25, demand: 0.85, prestige: 1.1 },
  { id: "industri",  name: "Industriområdet",  base: 11000, growth: 0.9,  demand: 0.75, prestige: 0.7 },
  { id: "förort",    name: "Förorten",         base: 15000, growth: 1.1,  demand: 0.90, prestige: 0.9 },
  { id: "kulle",     name: "Villakullen",      base: 28000, growth: 1.05, demand: 0.95, prestige: 1.3 },
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
}

export const DISTRICT_GEN: Record<string, DistrictGenProfile> = {
  centrum:   { types: [["kontor", 45], ["butik", 25], ["bostad", 30]], areaMin: 800,  areaMax: 3500, weight: 25 },
  finans:    { types: [["kontor", 85], ["butik", 15]],                 areaMin: 2500, areaMax: 9000, weight: 9 },
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
    label: "Bostadshus",
    rentFactor: 0.0050,   // was 0.0042 → +19 %
    opexFactor: 0.23,     // was 0.28  → −18 %
    vacancyBase: 0.04,    // oförändrad (stabil boendemarknad)
    buildCostM2: 18000,   // was 24000 → bygg lönsamt i rätt distrikt
    buildMonths: 10,
  },
  kontor: {
    label: "Kontor",
    rentFactor: 0.0060,   // 0.0055→0.0060: högre vakans (10 %) ska ge högre yield
    opexFactor: 0.26,     // was 0.32  → −19 %
    vacancyBase: 0.10,    // oförändrad (kontorsmarknaden rörlig)
    buildCostM2: 22000,   // was 28000
    buildMonths: 12,
  },
  butik: {
    label: "Butik",
    rentFactor: 0.0068,   // 0.0060→0.0068: högst vakans (13 %) ⇒ högst yield/risk
    opexFactor: 0.23,     // was 0.30  → −23 %
    vacancyBase: 0.13,    // was 0.12  (lite svårare att fylla)
    buildCostM2: 20000,   // was 26000
    buildMonths: 11,
  },
  industri: {
    label: "Industri/Lager",
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
    name: "Renovering",
    cost: 0.12,
    rentBoost: 0.18,
    condBoost: 35,
    desc: "Höjer hyra och skick.",
  },
  {
    id: "energi",
    name: "Energiåtgärd",
    cost: 0.08,
    opexCut: 0.2,
    condBoost: 10,
    desc: "Sänker driftkostnad.",
  },
  {
    id: "tillbygg",
    name: "Tillbyggnad",
    cost: 0.22,
    valueBoost: 0.25,
    rentBoost: 0.1,
    desc: "Ökar yta och värde.",
  },
  { id: "smart", name: "Smart fastighet", cost: 0.06, vacancyCut: 0.3, desc: "Sänker vakans." },
];

// Hyresgästprofiler (kvalitet påverkar hyra, kontraktslängd, risk)
export const TENANT_PROFILES: TenantProfile[] = [
  {
    id: "stat",
    name: "Statlig myndighet",
    quality: 1.15,
    termMin: 60,
    termMax: 120,
    defaultRisk: 0.002,
  },
  {
    id: "kedja",
    name: "Etablerad kedja",
    quality: 1.08,
    termMin: 36,
    termMax: 84,
    defaultRisk: 0.006,
  },
  { id: "smb", name: "Mindre företag", quality: 1.0, termMin: 24, termMax: 60, defaultRisk: 0.018 },
  {
    id: "privat",
    name: "Privatperson",
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
    text: "Riksbanken höjer styrräntan med 0,25 %. Hyresefterfrågan dämpas och börsen svalnar.",
    apply: (s) => ({
      ...s,
      interestRate: +(s.interestRate + 0.25).toFixed(2),
      demandMod: +(s.demandMod * 0.98).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.985).toFixed(3),
    }),
  },
  {
    id: "rate_down",
    text: "Riksbanken sänker styrräntan med 0,25 %. Investeringsklimatet och börsen lyfter.",
    apply: (s) => ({
      ...s,
      interestRate: Math.max(0.5, +(s.interestRate - 0.25).toFixed(2)),
      demandMod: +(s.demandMod * 1.02).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.015).toFixed(3),
    }),
  },
  {
    id: "boom",
    text: "Högkonjunktur! Marknadsvärden, hyresefterfrågan och börsen stiger.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.06).toFixed(3),
      demandMod: +(s.demandMod * 1.03).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.04).toFixed(3),
    }),
  },
  {
    id: "bust",
    text: "Lågkonjunktur. Marknadsvärden faller, efterfrågan sjunker och börsen tappar.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 0.94).toFixed(3),
      demandMod: +(s.demandMod * 0.97).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.95).toFixed(3),
    }),
  },
  {
    id: "tenant_demand",
    text: "Ökad inflyttning till staden. Hyresefterfrågan stiger markant.",
    apply: (s) => ({
      ...s,
      demandMod: +(s.demandMod * 1.05).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.01).toFixed(3),
    }),
  },
  {
    id: "tax",
    text: "Höjd fastighetsskatt aviseras.",
    apply: (s) => ({
      ...s,
      taxMod: +(s.taxMod * 1.04).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 0.99).toFixed(3),
    }),
  },
  {
    id: "pr",
    text: "Positiv press om ditt bolag. Reputation +5.",
    apply: (s) => ({ ...s, reputation: Math.min(100, s.reputation + 5) }),
  },
  {
    id: "ravarubrist",
    text: "Råvarubrist! Byggmaterial blir dyrare en tid framåt.",
    apply: (s) => ({ ...s, buildCostMod: +(((s.buildCostMod ?? 1) * 1.3)).toFixed(3) }),
  },
  {
    id: "hyresreglering",
    text: "Nya regler: skärpt hyresreglering dämpar efterfrågan.",
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
    text: "Finanskris! Marknadsvärden kraschar, börsen rasar och hyresgäster lämnar.",
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
    text: "Fastighetsboom! Priserna, hyresefterfrågan och börsen skjuter i höjden.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.10).toFixed(3),
      demandMod: +(s.demandMod * 1.06).toFixed(3),
      marketSentiment: +((s.marketSentiment ?? 1) * 1.12).toFixed(3),
    }),
  },
  {
    id: "recession",
    text: "Finanskris! Lågkonjunktur pressar hyresgäster de kommande 3 månaderna. Konkursrisken stiger kraftigt.",
    apply: (s) => ({ ...s, recessionMonthsLeft: 3, marketMod: +(s.marketMod * 0.88).toFixed(3), demandMod: +(s.demandMod * 0.92).toFixed(3) }),
  },
];

/** Lokala distriktshändelser – en händelse per distrikt med ~8 % chans/mån. */
export const DISTRICT_EVENTS: GameEvent[] = [
  {
    id: "tunnelbana",
    text: "Ny tunnelbanestation planeras. Distriktets attraktivitet stiger.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 1.03).toFixed(3) }),
  },
  {
    id: "byggstörning",
    text: "Stort byggprojekt skapar störningar. Tillfällig vakansökning.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 0.97).toFixed(3) }),
  },
  {
    id: "stadsfornyelese",
    text: "Stadsförnyelse i distriktet lockar nya invånare och företag.",
    apply: (s) => ({
      ...s,
      marketMod: +(s.marketMod * 1.02).toFixed(3),
      demandMod: +(s.demandMod * 1.02).toFixed(3),
    }),
  },
  {
    id: "oversv",
    text: "Översvämningsrisk i kustområdet. Fastighetsvärden dämpas tillfälligt.",
    apply: (s) => ({ ...s, marketMod: +(s.marketMod * 0.98).toFixed(3) }),
  },
  {
    id: "brottsvag",
    text: "Ökad brottslighet rapporteras. Hyresefterfrågan sjunker lokalt.",
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
  { id: "first_buy",    title: "Första förvärvet",       desc: "Köp din första fastighet.",                        check: (s) => s.portfolio.length >= 1,                                   reward: "Reputation +3" },
  { id: "first_office", title: "Kontorsdebut",           desc: "Äg en kontorsfastighet.",                          check: (s) => s.portfolio.some((p) => p.type === "kontor"),              reward: "Tillgång till Investmentbanken" },
  { id: "5props",       title: "Fastighetsmäklare",      desc: "Äg minst 5 färdiga fastigheter.",                  check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 5, reward: "Reputation +5" },
  { id: "first_10m",    title: "10 Miljoners-klubben",   desc: "Nå 10 MSEK i eget kapital.",                       check: (s) => (s.cash + s.portfolio.reduce((a, p) => a + p.askPrice, 0) - s.debt) >= 10_000_000, reward: "Reputation +5" },
  { id: "district_dom", title: "Distriktsledare",        desc: "Äg flest fastigheter i ett distrikt.",             check: (s) => checkDistrictLead(s),                                      reward: "Distriktets dragningskraft +5 %" },
  { id: "first_build",  title: "Byggherren",             desc: "Bygg din första fastighet från grunden.",          check: (s) => s.portfolio.some((p) => (p.txHistory ?? []).some((t) => t.type === "nybygg")), reward: "Byggtid −1 månad" },
  { id: "no_debt",      title: "Skuldfri",               desc: "Ha noll skulder med minst 3 fastigheter.",         check: (s) => s.debt === 0 && s.portfolio.length >= 3,                   reward: "Reputation +10" },
  { id: "50_rep",       title: "Etablerat namn",         desc: "Nå 50 i reputation.",                              check: (s) => s.reputation >= 50,                                        reward: "Ränterabatt via bättre långivare" },
  { id: "50m_equity",   title: "Fastighetsimperium",     desc: "Nå 50 MSEK i eget kapital.",                       check: (s) => (s.cash + s.portfolio.reduce((a, p) => a + p.askPrice, 0) - s.debt) >= 50_000_000, reward: "Reputation +15" },
  { id: "full_coverage",title: "Rikstäckande",           desc: "Äg fastigheter i minst 5 av stadens 7 distrikt.",  check: (s) => new Set(s.portfolio.map((p) => p.district)).size >= 5,     reward: "Distriktsdiversifiering −5 % vakans" },
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
    name: "Rödgrön koalition",
    desc: "Skärpt hyresreglering och höjd fastighetsskatt.",
    apply: (s) => ({ ...s, taxMod: +(s.taxMod * 1.06).toFixed(3), demandMod: +(s.demandMod * 0.96).toFixed(3) }),
  },
  {
    id: "borgerlig",
    name: "Borgerlig majoritet",
    desc: "Sänkt fastighetsskatt och enklare bygglov.",
    apply: (s) => ({ ...s, taxMod: +(s.taxMod * 0.95).toFixed(3), buildCostMod: +((s.buildCostMod ?? 1) * 0.92).toFixed(3) }),
  },
  {
    id: "mittenkoalition",
    name: "Mittenkoalition",
    desc: "Stabil politik. Inga dramatiska förändringar.",
    apply: (s) => ({ ...s, demandMod: +(s.demandMod * 1.01).toFixed(3) }),
  },
];

export const AI_NAMES = [
  "Nordhem Fastigheter",
  "Brunnsparken Invest",
  "Kustlinjen AB",
  "Stadskärnan Gruppen",
  "Hamnvikens Kapital",
  "Silverberg & Partners",
  "Lundqvist Fastigheter",
];

/** Affärsnamn per hyresgästprofil – ger varje kontrakt en egen identitet. */
export const TENANT_NAMES: Record<string, string[]> = {
  stat: ["Skatteverket", "Försäkringskassan", "Lantmäteriet", "Arbetsförmedlingen", "Migrationsverket"],
  kedja: ["ICA Nära", "Espresso House", "Apoteket", "Systembolaget", "Clas Ohlson", "Pressbyrån", "Hemtex"],
  smb: ["Café Lyckan", "Berg & Co Redovisning", "Nordvik Tandvård", "Studio Form", "Bokhandeln Pagina", "Frisör Saxon"],
  privat: ["Familjen Andersson", "Familjen Lindqvist", "Erik & Sofia", "Familjen Öberg", "Familjen Holm"],
  startup: ["Pixelplay AB", "Greenmile Tech", "Fjord Analytics", "Loopa", "Nordbyte", "Tindra Studio"],
};
