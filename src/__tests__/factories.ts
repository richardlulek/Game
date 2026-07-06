/* Testhjälpare – bygger minimala, deterministiska tillstånd. */

import { START_DISTRICTS } from "../engine/data";
import type { Competitor, GameState, Property, Tenant } from "../engine/types";

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
    unlockedDistricts: [...START_DISTRICTS],
    log: [],
    history: [{ month: 0, equity: 5_000_000 }],
    gameOver: false,
    ...over,
  };
}

export function makeCompetitor(over: Partial<Competitor> = {}): Competitor {
  return {
    name: "Testbolaget AB",
    cash: 5_000_000,
    units: 0,
    equity: 10_000_000,
    holdings: [],
    ...over,
  };
}

export function makeProperty(over: Partial<Property> = {}): Property {
  return {
    id: 1,
    district: "centrum",
    parcelId: "centrum-0",
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
    tenant: null,
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
