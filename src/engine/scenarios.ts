import { equityOf } from "./finance";
import { msek } from "./format";
import { accessibilityOf } from "./infrastructure";
import { STORY_BEATS } from "./story";
import type { Competitor, GameState, ScenarioId } from "./types";

export interface Scenario {
  id: ScenarioId;
  title: string;
  subtitle: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
  progress: (s: GameState) => { value: number; max: number; label: string };
}

const DISTRICT_IDS = ["centrum", "finans", "innerstad", "hamnen", "industri", "förort", "kulle"];

function dominatedDistricts(s: GameState): number {
  let n = 0;
  for (const d of DISTRICT_IDS) {
    const playerCount = s.portfolio.filter((p) => p.district === d && p.status === "klar").length;
    const maxRival = Math.max(0, ...s.competitors.map((c) => c.portfolio.filter((p) => p.district === d).length));
    if (playerCount >= 2 && playerCount > maxRival) n++;
  }
  return n;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "arvet",
    title: "Grandpa's Inheritance",
    subtitle: "Story mode · 9 chapters",
    desc: "You inherit a run-down house on Villa Hill and $850,000 from grandpa's freezer. The campaign teaches everything – with Gus, Ruth at the bank and Rog Flint.",
    icon: "📜",
    check: (s) => !!s.story?.done,
    progress: (s) => {
      const idx = s.story ? Math.max(0, STORY_BEATS.findIndex((b) => b.id === s.story!.beat)) : 0;
      const value = s.story?.done ? STORY_BEATS.length : idx;
      return { value, max: STORY_BEATS.length, label: s.story?.done ? "Completed" : `Chapter ${idx} of ${STORY_BEATS.length - 1}` };
    },
  },
  {
    id: "equity50",
    title: "The Quick Start",
    subtitle: "$50M equity",
    desc: "Build up $50M in equity. A good fit for learning the game.",
    icon: "⚡",
    check: (s) => equityOf(s) >= 50_000_000,
    progress: (s) => {
      const eq = Math.max(0, equityOf(s));
      return { value: Math.min(eq, 50_000_000), max: 50_000_000, label: `${msek(eq)} / $50M` };
    },
  },
  {
    id: "equity200",
    title: "Property Mogul",
    subtitle: "$200M equity",
    desc: "Raise an empire worth $200M. A long challenge for seasoned players.",
    icon: "🏆",
    check: (s) => equityOf(s) >= 200_000_000,
    progress: (s) => {
      const eq = Math.max(0, equityOf(s));
      return { value: Math.min(eq, 200_000_000), max: 200_000_000, label: `${msek(eq)} / $200M` };
    },
  },
  {
    id: "districts3",
    title: "District Dominator",
    subtitle: "Dominate 3 districts",
    desc: "Hold the most properties in at least 3 of 5 districts. A focused strategy is required.",
    icon: "🗺️",
    check: (s) => dominatedDistricts(s) >= 3,
    progress: (s) => {
      const n = dominatedDistricts(s);
      return { value: n, max: 3, label: `${n} / 3 districts dominated` };
    },
  },
  {
    id: "units25",
    title: "The Portfolio Builder",
    subtitle: "25 owned properties",
    desc: "Own 25 completed properties. Broad diversification and an active acquisition strategy.",
    icon: "🏗️",
    check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 25,
    progress: (s) => {
      const n = s.portfolio.filter((p) => p.status === "klar").length;
      return { value: n, max: 25, label: `${n} / 25 properties` };
    },
  },
  {
    id: "sandbox",
    title: "Sandbox",
    subtitle: "No win condition",
    desc: "Play without limits and without a time cap. Perfect for experimenting.",
    icon: "∞",
    check: () => false,
    progress: () => ({ value: 0, max: 1, label: "–" }),
  },
  {
    id: "diversified",
    title: "Diversified Empire",
    subtitle: "Own all four sectors",
    desc: "Own at least 1 active asset in every sector: property, hotels, energy and logistics.",
    icon: "🌐",
    check: (s) => {
      const hasRE = s.portfolio.some((p) => p.status === "klar");
      const sects = new Set((s.industryPortfolio ?? []).filter((a) => a.status === "klar").map((a) => a.sector));
      return hasRE && sects.has("hotell") && sects.has("energi") && sects.has("logistik");
    },
    progress: (s) => {
      const hasRE = s.portfolio.some((p) => p.status === "klar") ? 1 : 0;
      const sects = new Set((s.industryPortfolio ?? []).filter((a) => a.status === "klar").map((a) => a.sector));
      const n = hasRE + (sects.has("hotell") ? 1 : 0) + (sects.has("energi") ? 1 : 0) + (sects.has("logistik") ? 1 : 0);
      return { value: n, max: 4, label: `${n} / 4 sectors active` };
    },
  },
  {
    id: "energyBaron",
    title: "Rise of the Energy Baron",
    subtitle: "500 MWh/mo and $5M/mo",
    desc: "Build an energy empire: 500 MWh/month and at least $5M/month from renewable energy.",
    icon: "⚡🌱",
    check: (s) => {
      const energyAssets = (s.industryPortfolio ?? []).filter((a) => a.sector === "energi" && a.status === "klar");
      const totalRev = energyAssets.reduce((sum, a) => sum + a.monthlyRevenue, 0);
      const totalMW = energyAssets.reduce((sum, a) => sum + (a.energyMeta?.installedMW ?? 0), 0);
      const totalMWh = totalMW * 0.20 * 730; // konservativ cf
      return totalMWh >= 500 && totalRev >= 5_000_000;
    },
    progress: (s) => {
      const energyAssets = (s.industryPortfolio ?? []).filter((a) => a.sector === "energi" && a.status === "klar");
      const totalRev = energyAssets.reduce((sum, a) => sum + a.monthlyRevenue, 0);
      const pct = Math.min(100, Math.round(totalRev / 50_000));
      return { value: pct, max: 100, label: `${msek(totalRev)} / $5M revenue` };
    },
  },
  {
    id: "hotelKing",
    title: "The Hotel King",
    subtitle: "80% OCC for 6 months straight",
    desc: "Keep average occupancy at 80% or more across all your hotels for 6 consecutive months.",
    icon: "🏨",
    check: (s) => (s.hotelHighOccConsecutiveMonths ?? 0) >= 6,
    progress: (s) => {
      const n = s.hotelHighOccConsecutiveMonths ?? 0;
      return { value: n, max: 6, label: `${n} / 6 months of high occupancy` };
    },
  },
  {
    id: "infraMagnat",
    title: "The Transit Tycoon",
    subtitle: "10 properties on the rails",
    desc: "Own 10 completed properties in districts with real infrastructure (accessibility ≥ 1.05). Buy before the metro opens — or make it open where you own.",
    icon: "🚇",
    check: (s) => connectedHoldings(s.portfolio.filter((p) => p.status === "klar"), s) >= 10,
    progress: (s) => {
      const n = connectedHoldings(s.portfolio.filter((p) => p.status === "klar"), s);
      return { value: n, max: 10, label: `${n} / 10 connected properties` };
    },
  },
  {
    id: "bankir",
    title: "The Financier",
    subtitle: "Bank + insurer, $60M lifetime profit",
    desc: "Own both the bank and the insurance company, and take their combined lifetime net profit to $60M. Capital is the real estate of money.",
    icon: "🏦",
    check: (s) => institutionNet(s) >= 60_000_000 && !!s.ownedBank && !!s.ownedInsurer,
    progress: (s) => {
      const n = Math.max(0, institutionNet(s));
      return { value: Math.min(n, 60_000_000), max: 60_000_000, label: `${msek(n)} / $60M institution profit` };
    },
  },
  {
    id: "konsolidator",
    title: "The Last Empires",
    subtitle: "≤ 4 rivals left · $100M equity",
    desc: "Outlast the great consolidation: be worth $100M when at most four rival companies remain standing. Mergers, distress and rate shocks are your allies.",
    icon: "🏰",
    check: (s) => s.competitors.length <= 4 && equityOf(s) >= 100_000_000,
    progress: (s) => {
      const eq = Math.min(1, Math.max(0, equityOf(s)) / 100_000_000);
      const startField = 11; // 7 stora + 4 uppstickare
      const eaten = Math.min(1, Math.max(0, (startField - s.competitors.length) / (startField - 4)));
      const pct = Math.round(((eq + eaten) / 2) * 100);
      return { value: pct, max: 100, label: `${s.competitors.length} rivals left · ${msek(Math.max(0, equityOf(s)))}` };
    },
  },
];

/** Antal färdiga innehav i distrikt med utbyggd infrastruktur. */
function connectedHoldings(portfolio: { district: string }[], s: GameState): number {
  return portfolio.filter((p) => accessibilityOf(s, p.district) >= 1.05).length;
}

/** Institutionernas samlade livstidsresultat (bank + försäkring). */
function institutionNet(s: GameState): number {
  return (s.ownedBank?.totalNet ?? 0) + (s.ownedInsurer?.totalNet ?? 0);
}

const SCENARIO_DISTRICT_IDS = ["centrum", "finans", "innerstad", "hamnen", "industri", "förort", "kulle"] as const;

export function rivalScenarioProgress(rival: Competitor, scenarioId: ScenarioId, s: GameState): number {
  switch (scenarioId) {
    case "equity50": return Math.min(1, rival.equity / 50_000_000);
    case "equity200": return Math.min(1, rival.equity / 200_000_000);
    case "units25": return Math.min(1, rival.portfolio.filter((p) => p.status === "klar").length / 25);
    // Rivalerna tävlar även om spårnära lägen (fas 4).
    case "infraMagnat":
      return Math.min(1, rival.portfolio.filter((p) => p.status === "klar" && accessibilityOf(s, p.district) >= 1.05).length / 10);
    case "districts3": {
      let n = 0;
      for (const d of SCENARIO_DISTRICT_IDS) {
        const rc = rival.portfolio.filter((p) => p.district === d).length;
        const pc = s.portfolio.filter((p) => p.district === d && p.status === "klar").length;
        if (rc >= 2 && rc > pc) n++;
      }
      return Math.min(1, n / 3);
    }
    default: return 0;
  }
}

export function rivalWinsScenario(rival: Competitor, scenarioId: ScenarioId, s: GameState): boolean {
  switch (scenarioId) {
    case "equity50": return rival.equity >= 50_000_000;
    case "equity200": return rival.equity >= 200_000_000;
    case "units25": return rival.portfolio.filter((p) => p.status === "klar").length >= 25;
    case "infraMagnat":
      return rival.portfolio.filter((p) => p.status === "klar" && accessibilityOf(s, p.district) >= 1.05).length >= 10;
    case "districts3": {
      let n = 0;
      for (const d of SCENARIO_DISTRICT_IDS) {
        const rc = rival.portfolio.filter((p) => p.district === d).length;
        const pc = s.portfolio.filter((p) => p.district === d && p.status === "klar").length;
        if (rc >= 2 && rc > pc) n++;
      }
      return n >= 3;
    }
    default: return false;
  }
}
