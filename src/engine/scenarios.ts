import { equityOf } from "./finance";
import { msek } from "./format";
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
    title: "Arvet efter morfar",
    subtitle: "Berättelseläge · 9 kapitel",
    desc: "Du ärver ett slitet hus i Villakullen och 850 000 kr ur morfars frys. Kampanjen lär ut allt – med Gösta, Ulla på banken och Rogge Flyt.",
    icon: "📜",
    check: (s) => !!s.story?.done,
    progress: (s) => {
      const idx = s.story ? Math.max(0, STORY_BEATS.findIndex((b) => b.id === s.story!.beat)) : 0;
      const value = s.story?.done ? STORY_BEATS.length : idx;
      return { value, max: STORY_BEATS.length, label: s.story?.done ? "Fullbordat" : `Kapitel ${idx} av ${STORY_BEATS.length - 1}` };
    },
  },
  {
    id: "equity50",
    title: "Snabbstarten",
    subtitle: "50 Msek eget kapital",
    desc: "Bygg upp ett eget kapital på 50 Msek. Passar den som vill lära sig spelet.",
    icon: "⚡",
    check: (s) => equityOf(s) >= 50_000_000,
    progress: (s) => {
      const eq = Math.max(0, equityOf(s));
      return { value: Math.min(eq, 50_000_000), max: 50_000_000, label: `${msek(eq)} / 50 Msek` };
    },
  },
  {
    id: "equity200",
    title: "Fastighetsmogul",
    subtitle: "200 Msek eget kapital",
    desc: "Res ett imperium värt 200 Msek. En lång utmaning för erfarna spelare.",
    icon: "🏆",
    check: (s) => equityOf(s) >= 200_000_000,
    progress: (s) => {
      const eq = Math.max(0, equityOf(s));
      return { value: Math.min(eq, 200_000_000), max: 200_000_000, label: `${msek(eq)} / 200 Msek` };
    },
  },
  {
    id: "districts3",
    title: "Distriktsdominator",
    subtitle: "Dominera 3 stadsdelar",
    desc: "Ha flest fastigheter i minst 3 av 5 stadsdelar. Fokuserad strategi krävs.",
    icon: "🗺️",
    check: (s) => dominatedDistricts(s) >= 3,
    progress: (s) => {
      const n = dominatedDistricts(s);
      return { value: n, max: 3, label: `${n} / 3 distrikt dominerade` };
    },
  },
  {
    id: "units25",
    title: "Portföljbyggaren",
    subtitle: "25 ägda fastigheter",
    desc: "Äg 25 färdiga fastigheter. Bred diversifiering och aktiv förvärvssstrategi.",
    icon: "🏗️",
    check: (s) => s.portfolio.filter((p) => p.status === "klar").length >= 25,
    progress: (s) => {
      const n = s.portfolio.filter((p) => p.status === "klar").length;
      return { value: n, max: 25, label: `${n} / 25 fastigheter` };
    },
  },
  {
    id: "sandbox",
    title: "Friläge",
    subtitle: "Inget vinstmål",
    desc: "Spela utan begränsning och utan tidsgräns. Perfekt för experimenterande.",
    icon: "∞",
    check: () => false,
    progress: () => ({ value: 0, max: 1, label: "–" }),
  },
  {
    id: "diversified",
    title: "Diversifierat Imperium",
    subtitle: "Äg alla fyra sektorer",
    desc: "Äg minst 1 aktiv tillgång i varje sektor: fastigheter, hotell, energi och logistik.",
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
      return { value: n, max: 4, label: `${n} / 4 sektorer aktiva` };
    },
  },
  {
    id: "energyBaron",
    title: "Energibaronens uppgång",
    subtitle: "500 MWh/mån och 5 Msek/mån",
    desc: "Bygg ett energiimperium: 500 MWh/månad och minst 5 Msek/månad från förnybar energi.",
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
      return { value: pct, max: 100, label: `${msek(totalRev)} / 5 Msek intäkt` };
    },
  },
  {
    id: "hotelKing",
    title: "Hotellkungen",
    subtitle: "80 % OCC i 6 månader i rad",
    desc: "Håll genomsnittlig beläggningsgrad på 80 % eller mer i alla dina hotell under 6 månader i följd.",
    icon: "🏨",
    check: (s) => (s.hotelHighOccConsecutiveMonths ?? 0) >= 6,
    progress: (s) => {
      const n = s.hotelHighOccConsecutiveMonths ?? 0;
      return { value: n, max: 6, label: `${n} / 6 månader med hög beläggning` };
    },
  },
];

const SCENARIO_DISTRICT_IDS = ["centrum", "finans", "innerstad", "hamnen", "industri", "förort", "kulle"] as const;

export function rivalScenarioProgress(rival: Competitor, scenarioId: ScenarioId, s: GameState): number {
  switch (scenarioId) {
    case "equity50": return Math.min(1, rival.equity / 50_000_000);
    case "equity200": return Math.min(1, rival.equity / 200_000_000);
    case "units25": return Math.min(1, rival.portfolio.filter((p) => p.status === "klar").length / 25);
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
