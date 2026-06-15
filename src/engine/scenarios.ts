import { equityOf } from "./finance";
import { msek } from "./format";
import type { GameState, ScenarioId } from "./types";

export interface Scenario {
  id: ScenarioId;
  title: string;
  subtitle: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
  progress: (s: GameState) => { value: number; max: number; label: string };
}

const DISTRICT_IDS = ["centrum", "hamnen", "industri", "förort", "kulle"];

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
];
