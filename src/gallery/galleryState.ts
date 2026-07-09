/* ============================================================
   Galleritillstånd – ett rikt, deterministiskt GameState som ger
   varje panel innehåll att rendera. Används av UI-galleriet
   (?gallery) för visuell QA utan 3D-canvas, klocka eller nivålås.
   ============================================================ */

import { initState } from "../engine/initState";
import { MAX_LEVEL } from "../engine/company";
import type { GameState, Property, Tenant } from "../engine/types";

function tenant(id: number, rent: number): Tenant {
  return { id, profile: "smb", name: "Nordisk Handel AB", quality: 1, defaultRisk: 0.02, monthsLeft: 18, termTotal: 24, rent, satisfaction: 72 };
}

/** Gör om en marknadsnotering till en ägd, färdig fastighet. */
function own(p: Property, withTenant: boolean): Property {
  return {
    ...p,
    owned: true,
    status: "klar",
    buildLeft: 0,
    condition: Math.max(60, p.condition),
    tenants: withTenant ? [tenant(9000 + p.id, Math.round((p.baseRent ?? 100_000) / 12))] : [],
  };
}

export function galleryState(): GameState {
  const base = initState();
  // Flytta några objekt till egen portfölj så portfölj/finans/uthyrning fylls.
  const taken = base.listings.slice(0, 4);
  const portfolio = taken.map((p, i) => own(p, i % 2 === 0));
  const listings = base.listings.slice(4);

  return {
    ...base,
    companyLevel: MAX_LEVEL,
    companyName: "Nordhem Fastigheter",
    portfolio,
    listings,
    debt: 18_000_000,
    cash: 12_400_000,
    reputation: 68,
    dividendsReceived: 240_000,
    portfolioValueHistory: [0, 4_000_000, 9_500_000, 14_200_000, 21_800_000],
    sentimentHistory: [1.0, 1.03, 0.99, 1.06, 1.11],
    marketSentiment: 1.11,
    marketCycle: { phase: "boom", monthsRemaining: 7 },
    interestRate: 4.25,
  };
}
