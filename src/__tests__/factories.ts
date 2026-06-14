/* Testhjälpare – bygger minimala, deterministiska tillstånd. */

import type { GameState, Property, Tenant } from "../engine/types";

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
