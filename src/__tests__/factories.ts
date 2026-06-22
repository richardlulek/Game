/* Testhjälpare – bygger minimala, deterministiska tillstånd. */

import type { GameState, IndustryAsset, Property, Tenant } from "../engine/types";

export function makeState(over: Partial<GameState> = {}): GameState {
  return {
    month: 1,
    year: 1,
    cash: 5_000_000,
    debt: 0,
    interestRate: 4.0,
    marketMod: 1.0,
    demandMod: 1.0,
    taxMod: 1.0,
    reputation: 50,
    portfolio: [],
    listings: [],
    lots: [],
    competitors: [],
    log: [],
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
    worldTotal: 0,
    selectedLender: undefined,
    globalManager: undefined,
    scenarioId: undefined,
    gameWon: false,
    recessionMonthsLeft: 0,
    ...over,
  };
}

export function makeProperty(over: Partial<Property> = {}): Property {
  return {
    id: 1,
    district: "centrum",
    districtName: "Centrum",
    type: "bostad",
    typeLabel: "Bostadshus",
    area: 1000,
    condition: 100,
    askPrice: 1_000_000,
    baseRent: 100_000,
    upgrades: [],
    owned: true,
    rentMult: 1,
    opexMult: 1,
    vacancyMult: 1,
    valueMult: 1,
    tenants: [],
    capacity: 2,
    status: "klar",
    buildLeft: 0,
    ...over,
  };
}

export function makeIndustryAsset(over: Partial<IndustryAsset> = {}): IndustryAsset {
  return {
    id: 200,
    sector: "hotell",
    name: "Test Hotel",
    district: "centrum",
    districtName: "Centrum",
    purchasePrice: 10_000_000,
    condition: 80,
    upgrades: [],
    managed: false,
    insurance: false,
    status: "klar",
    buildLeft: 0,
    monthlyRevenue: 0,
    monthlyOpex: 0,
    totalRevenue: 0,
    txHistory: [],
    hotelMeta: {
      starRating: 3,
      totalRooms: 80,
      baseAdr: 1_200,
      bookingChannels: ["direktbokning"],
      reputationScore: 60,
      revParHistory: [],
    },
    energyMeta: null,
    logisticsMeta: null,
    ...over,
  };
}

export function makeTenantFixture(over: Partial<Tenant> = {}): Tenant {
  return {
    id: 100,
    profile: "smb",
    name: "Mindre företag",
    quality: 1.0,
    defaultRisk: 0.018,
    monthsLeft: 24,
    termTotal: 24,
    rent: 10_000,
    ...over,
  };
}
