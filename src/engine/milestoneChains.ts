/* ============================================================
   Milstolpekedjor (Masterplan fas 4, batch 2).

   De platta milstolparna ger en engångsartad rep-bonus. Kedjorna
   är fleretappersmål med PERMANENTA belöningar som förstärker den
   spelstil de mäter – bygg mycket och det blir billigare att bygga,
   sköt hyresgästerna och ryktet drar fler sökande. Nivåerna sparas
   i s.chainLevels och räknarna i s.chainCounters (additiva fält,
   inga migreringar behövs).

   Ren logik, inga React-beroenden.
   ============================================================ */

import type { GameState } from "./types";

export interface ChainStep {
  target: number;
  reward: string;
}

export interface MilestoneChain {
  id: string;
  title: string;
  icon: string;
  /** Vad räknaren mäter – visas i UI:t ("3 / 5 new builds"). */
  unit: string;
  desc: string;
  metric: (s: GameState) => number;
  steps: ChainStep[];
}

export const CHAINS: MilestoneChain[] = [
  {
    id: "byggmastaren",
    title: "Master Builder",
    icon: "🏗️",
    unit: "new builds completed",
    desc: "Complete new constructions. Every tier makes the crews cheaper.",
    metric: (s) => s.chainCounters?.builds ?? 0,
    steps: [
      { target: 1, reward: "Build costs −3%" },
      { target: 5, reward: "Build costs −6%" },
      { target: 15, reward: "Build costs −9%" },
    ],
  },
  {
    id: "hyresvarden",
    title: "Landlord of the Year",
    icon: "😊",
    unit: "delighted tenants (satisfaction ≥ 75)",
    desc: "Keep tenants delighted. Word of mouth fills your vacancies.",
    metric: (s) =>
      s.portfolio.flatMap((p) => p.tenants).filter((t) => (t.satisfaction ?? 60) >= 75).length,
    steps: [
      { target: 10, reward: "Application flow +2%" },
      { target: 25, reward: "Application flow +4%" },
      { target: 60, reward: "Application flow +6%" },
    ],
  },
  {
    id: "renoveraren",
    title: "The Restorer",
    icon: "🔨",
    unit: "development projects completed",
    desc: "Finish conversions, extensions and full renovations. Experienced crews wear buildings less.",
    metric: (s) => s.chainCounters?.renovations ?? 0,
    steps: [
      { target: 1, reward: "Wear −4%" },
      { target: 4, reward: "Wear −8%" },
      { target: 10, reward: "Wear −12%" },
    ],
  },
  {
    id: "stadsbyggaren",
    title: "City Shaper",
    icon: "🏙️",
    unit: "city investments (area/infra)",
    desc: "Invest in districts, co-finance and lobby for infrastructure. City hall listens to builders.",
    metric: (s) => s.chainCounters?.cityWorks ?? 0,
    steps: [
      { target: 1, reward: "Area investments +15% effect" },
      { target: 4, reward: "Area investments +30% effect" },
      { target: 10, reward: "Area investments +45% effect" },
    ],
  },
];

export function chainLevel(s: GameState, id: string): number {
  return s.chainLevels?.[id] ?? 0;
}

/* Permanenta effekter – läses av reducer/leasing/progression. */
export function chainBuildCostMult(s: GameState): number {
  return 1 - 0.03 * chainLevel(s, "byggmastaren");
}
export function chainAppFlowMult(s: GameState): number {
  return 1 + 0.02 * chainLevel(s, "hyresvarden");
}
export function chainWearMult(s: GameState): number {
  return 1 - 0.04 * chainLevel(s, "renoveraren");
}
export function chainInvestBoostMult(s: GameState): number {
  return 1 + 0.15 * chainLevel(s, "stadsbyggaren");
}

/** Räkna upp en kedjeräknare (muterar s – används i simulationens block). */
export function bumpChainCounter(
  s: GameState,
  key: "builds" | "renovations" | "cityWorks",
): void {
  s.chainCounters = { ...(s.chainCounters ?? {}), [key]: (s.chainCounters?.[key] ?? 0) + 1 };
}

/** Ren hjälpare för reducerns immutabla returer. */
export function bumpedCounters(
  s: GameState,
  key: "builds" | "renovations" | "cityWorks",
): Record<string, number> {
  return { ...(s.chainCounters ?? {}), [key]: (s.chainCounters?.[key] ?? 0) + 1 };
}
