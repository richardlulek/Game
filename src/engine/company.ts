/* ============================================================
   Bolagsresan – nivåer från enskild fastighetsägare till
   börsnoterat imperium. Nivån styr vilka funktioner (fönster)
   som är upplåsta och hur huvudkontoret ser ut på kartan.
   Ren logik, inga React-beroenden.
   ============================================================ */

import { equityOf } from "./finance";
import type { GameState } from "./types";

export interface CompanyTier {
  level: number;
  name: string;
  icon: string;
  /** Krav för att nå nivån (båda måste uppfyllas). */
  minEquity: number;
  minUnits: number;
  /** Kräver genomförd börsnotering. */
  requiresIpo?: boolean;
  /** Fönster-id:n som låses upp PÅ denna nivå. */
  unlocks: string[];
  /** Kort beskrivning som visas vid nivåhöjning. */
  desc: string;
}

export const TIERS: CompanyTier[] = [
  {
    level: 1,
    name: "Enskild fastighetsägare",
    icon: "🏠",
    minEquity: 0,
    minUnits: 0,
    unlocks: ["company", "portfolio", "market", "finance", "tenants", "log"],
    desc: "Du och din första fastighet. Allt sköts vid köksbordet.",
  },
  {
    level: 2,
    name: "Litet fastighetsbolag",
    icon: "🏢",
    minEquity: 8_000_000,
    minUnits: 2,
    unlocks: ["build", "rivals", "calendar", "milestones", "nyheter"],
    desc: "Bolaget registreras och flyttar in på ett riktigt kontor.",
  },
  {
    level: 3,
    name: "Etablerat fastighetsbolag",
    icon: "🏛️",
    minEquity: 20_000_000,
    minUnits: 4,
    unlocks: ["staff", "research", "kpi", "districts", "overview"],
    desc: "Dags att anställa chefer och arbeta strategiskt.",
  },
  {
    level: 4,
    name: "Regional koncern",
    icon: "🌆",
    minEquity: 50_000_000,
    minUnits: 8,
    unlocks: ["stocks", "acquisition", "group"],
    desc: "Kapitalmarknaden öppnas: börshandel och företagsförvärv.",
  },
  {
    level: 5,
    name: "Nationell fastighetsjätte",
    icon: "🏙️",
    minEquity: 110_000_000,
    minUnits: 12,
    unlocks: ["industri", "ind_marknad"],
    desc: "Diversifiering: hotell, energi och logistik – och vägen mot börsen.",
  },
  {
    level: 6,
    name: "Börsnoterat imperium",
    icon: "👑",
    minEquity: 180_000_000,
    minUnits: 16,
    requiresIpo: true,
    unlocks: [],
    desc: "Ditt bolag handlas på börsen. Staden bär din logotyp.",
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

export const DEFAULT_COMPANY_NAME = "Mitt Fastighetsbolag";
