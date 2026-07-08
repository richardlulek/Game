/* ============================================================
   Bolagsresan – nivåer från enskild fastighetsägare till
   börsnoterat imperium. Nivån styr vilka funktioner (fönster)
   som är upplåsta och hur huvudkontoret ser ut på kartan.
   Ren logik, inga React-beroenden.
   ============================================================ */

import { equityOf } from "./finance";
import type { Competitor, GameState } from "./types";

export interface CompanyTier {
  level: number;
  name: string;
  icon: string;
  /** Krav för att nå nivån (båda måste uppfyllas). */
  minEquity: number;
  minUnits: number;
  /** Kräver genomförd börsnotering. */
  requiresIpo?: boolean;
  /** Engångskostnad för att expandera TILL denna nivå (nytt kontor m.m.). */
  upgradeCost: number;
  /** Månatlig kontorskostnad på denna nivå. */
  monthlyOverhead: number;
  /** Så många fastigheter klarar organisationen att självförvalta.
   *  Fastigheter med förvaltare (eller portföljdirektör) räknas inte. */
  selfManagedCap: number;
  /** Fönster-id:n som låses upp PÅ denna nivå. */
  unlocks: string[];
  /** Kort beskrivning som visas vid nivåhöjning. */
  desc: string;
  /** Tidningsrubrik när nivån nås ({n} ersätts med bolagsnamnet). */
  headline: string;
}

export const TIERS: CompanyTier[] = [
  {
    level: 1,
    name: "Enskild fastighetsägare",
    icon: "🏠",
    minEquity: 0,
    minUnits: 0,
    upgradeCost: 0,
    monthlyOverhead: 0,
    selfManagedCap: 3,
    unlocks: ["company", "portfolio", "market", "finance", "tenants", "log"],
    desc: "Du och din första fastighet. Allt sköts vid köksbordet.",
    headline: "Ny fastighetsägare i staden",
  },
  {
    level: 2,
    name: "Litet fastighetsbolag",
    icon: "🏢",
    minEquity: 8_000_000,
    minUnits: 2,
    upgradeCost: 400_000,
    monthlyOverhead: 9_000,
    selfManagedCap: 6,
    unlocks: ["build", "rivals", "calendar", "milestones", "nyheter", "policy"],
    desc: "Bolaget registreras och flyttar in på ett riktigt kontor.",
    headline: "{n} registrerat – nytt fastighetsbolag tar plats i staden",
  },
  {
    level: 3,
    name: "Etablerat fastighetsbolag",
    icon: "🏛️",
    minEquity: 20_000_000,
    minUnits: 4,
    upgradeCost: 1_200_000,
    monthlyOverhead: 28_000,
    selfManagedCap: 10,
    unlocks: ["staff", "research", "kpi", "districts", "overview"],
    desc: "Dags att anställa chefer och arbeta strategiskt.",
    headline: "{n} etablerar sig – rekryterar chefer och satsar på utveckling",
  },
  {
    level: 4,
    name: "Regional koncern",
    icon: "🌆",
    minEquity: 50_000_000,
    minUnits: 8,
    upgradeCost: 3_500_000,
    monthlyOverhead: 65_000,
    selfManagedCap: 16,
    unlocks: ["stocks", "acquisition", "group"],
    desc: "Kapitalmarknaden öppnas: börshandel och företagsförvärv.",
    headline: "{n} växer till regional koncern – börsen och förvärv väntar",
  },
  {
    level: 5,
    name: "Nationell fastighetsjätte",
    icon: "🏙️",
    minEquity: 110_000_000,
    minUnits: 12,
    upgradeCost: 8_000_000,
    monthlyOverhead: 140_000,
    selfManagedCap: 26,
    unlocks: ["industri", "ind_marknad"],
    desc: "Diversifiering: hotell, energi och logistik – och vägen mot börsen.",
    headline: "{n} nu en av landets fastighetsjättar",
  },
  {
    level: 6,
    name: "Börsnoterat imperium",
    icon: "👑",
    minEquity: 180_000_000,
    minUnits: 16,
    requiresIpo: true,
    upgradeCost: 0,
    monthlyOverhead: 280_000,
    selfManagedCap: 999,
    unlocks: [],
    desc: "Ditt bolag handlas på börsen. Staden bär din logotyp.",
    headline: "BÖRSNOTERING: {n} ringer i klockan – imperiet fullbordat",
  },
];

export const MAX_LEVEL = TIERS[TIERS.length - 1].level;

export function tierForLevel(level: number): CompanyTier {
  return TIERS.find((t) => t.level === level) ?? TIERS[0];
}

export function nextTier(level: number): CompanyTier | null {
  return TIERS.find((t) => t.level === level + 1) ?? null;
}

/** Antal färdiga fastigheter (byggen räknas när de står klara). */
export function unitCount(state: GameState): number {
  return state.portfolio.filter((p) => p.status === "klar").length;
}

/** Uppfyller bolaget kraven för en viss nivå just nu? */
export function qualifiesFor(state: GameState, tier: CompanyTier): boolean {
  if (tier.requiresIpo && !state.ipoActive) return false;
  return equityOf(state) >= tier.minEquity && unitCount(state) >= tier.minUnits;
}

/**
 * Nivå utifrån nuvarande tillstånd (används vid migrering av gamla
 * sparfiler). I spelet stiger nivån via simulationen och sjunker aldrig.
 */
export function computedLevel(state: GameState): number {
  let level = 1;
  for (const t of TIERS) if (qualifiesFor(state, t)) level = t.level;
  return level;
}

/** Alla fönster-id:n som är upplåsta till och med angiven nivå. */
export function unlockedWindows(level: number): Set<string> {
  const out = new Set<string>();
  for (const t of TIERS) {
    if (t.level > level) break;
    for (const id of t.unlocks) out.add(id);
  }
  return out;
}

/** Nivån som låser upp ett visst fönster (för 🔒-tooltips). */
export function unlockLevelFor(windowId: string): number {
  for (const t of TIERS) if (t.unlocks.includes(windowId)) return t.level;
  return 1;
}

/** Organisationens belastning: självförvaltade fastigheter mot kapaciteten. */
export interface OrgLoad {
  selfManaged: number;
  cap: number;
  /** Antal fastigheter över kapaciteten (0 = allt under kontroll). */
  over: number;
}

export function orgLoadOf(state: GameState): OrgLoad {
  const cap = tierForLevel(state.companyLevel ?? 1).selfManagedCap;
  // Portföljdirektören täcker hela beståndet; annars räknas allt utan förvaltare.
  const selfManaged = state.globalManager?.active
    ? 0
    : state.portfolio.filter((p) => p.status === "klar" && !p.managed).length;
  return { selfManaged, cap, over: Math.max(0, selfManaged - cap) };
}

/** Administrativ merkostnad per månad när organisationen är överbelastad. */
export const OVERLOAD_COST_PER_PROP = 6_000;
/** Extra slitage på oförvaltade hus när organisationen inte hinner med. */
export const OVERLOAD_WEAR_MULT = 1.35;

/** Kan bolaget expandera till nästa nivå just nu (krav + kassa)? */
export function canUpgrade(state: GameState): {
  tier: CompanyTier | null;
  qualified: boolean;
  affordable: boolean;
} {
  const tier = nextTier(state.companyLevel ?? 1);
  if (!tier) return { tier: null, qualified: false, affordable: false };
  return {
    tier,
    qualified: qualifiesFor(state, tier),
    affordable: state.cash >= tier.upgradeCost,
  };
}

/** Rivalens bolagsnivå med samma trappa (IPO-kravet hoppas över). */
export function competitorLevel(c: Competitor): number {
  const units = (c.portfolio ?? []).filter((p) => p.status === "klar").length;
  let level = 1;
  for (const t of TIERS) {
    if (c.equity >= t.minEquity && units >= t.minUnits) level = t.level;
  }
  return level;
}

export const DEFAULT_COMPANY_NAME = "Mitt Fastighetsbolag";
