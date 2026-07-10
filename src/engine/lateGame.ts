/* ============================================================
   Slutspelet – utmaning när imperiet blivit stort:

   · Institutionella fonder: internationellt kapital kliver in
     när spelaren drar ifrån och tävlar om varje affär.
   · Aktivistfonden: efter börsnoteringen straffas död kassa
     och svag avkastning – ägarandelen (takeoverPressure) växer
     och vid 50 % tas bolaget över. Utdelningar lindrar.
   · Konkurrensverket: distriktsdominans ger prövningsavgifter,
     tillsyn och risk för tvångsreglering.
   · Fastighetskrisen: bubblor spricker – värdefall och stängt
     refinansieringsfönster. Kassa i kraschen = köpläge.
   · Megaprojekt & dynastipoäng: prestige-mål bortom pengar.
   · Ägarens privata förmögenhet: utdelningar blir privata
     pengar som kan spenderas på lyx och donationer.

   Ren logik utan React-beroenden.
   ============================================================ */

import { esgRatingOf } from "./esg";
import type { GameState } from "./types";

/* ── A1: Institutionella fonder ────────────────────────────────────── */

export const FUND_TRIGGER_EQUITY = 400_000_000;

export const FUNDS = [
  { name: "Meridian Global Partners", strategy: "värde" as const },
  { name: "Nordkap Infrastructure", strategy: "tillväxt" as const },
];

/** Har fonderna redan klivit in? */
export function fundsActive(s: GameState): boolean {
  return s.competitors.some((c) => c.institutional);
}

/* ── A2/A3: Aktivistfonden (efter IPO) ─────────────────────────────── */

export const ACTIVIST_TAKEOVER_AT = 50;

export interface ActivistTick {
  delta: number;
  reason: string | null;
}

/**
 * Månatlig förändring av aktivistens ägarandel (procentenheter).
 * Död kassa och svag avkastning bygger positionen; stark ROE minskar den.
 */
export function activistTick(cash: number, equity: number, annualReturn: number): ActivistTick {
  if (equity <= 0) return { delta: 0, reason: null };
  const idle = cash / equity;
  let delta = 0;
  const reasons: string[] = [];
  if (idle > 0.35) {
    delta += 1.5;
    reasons.push("död kassa");
  }
  const roe = annualReturn / equity;
  if (roe < 0.04) {
    delta += 1;
    reasons.push("svag avkastning");
  } else if (roe > 0.09) {
    delta -= 1;
  }
  if (delta === 0 && idle < 0.2) delta = -0.5; // väl skött → positionen säljs av
  return { delta, reason: reasons.length ? reasons.join(" och ") : null };
}

/** Utdelning blidkar kapitalmarknaden: −15 pe per utdelad andel av EK. */
export function dividendRelief(amount: number, equity: number): number {
  return equity > 0 ? Math.min(10, (amount / equity) * 150) : 0;
}

/* ── B4: Konkurrensverket ──────────────────────────────────────────── */

export const DOMINANCE_REVIEW_SHARE = 0.45;
export const DOMINANCE_SUPERVISED_SHARE = 0.5;
export const REVIEW_FEE_PCT = 0.05;
export const SUPERVISION_FEE = 25_000;

/** Spelarens andel av distriktets kända, färdiga fastigheter.
 *  Konkurrensverket bryr sig först när distriktet har en riktig
 *  marknad (≥ 6 kända fastigheter) – annars räknas andelen som 0. */
export function districtShareOf(s: GameState, district: string): number {
  const count = (arr: { district: string; status: string }[]) =>
    arr.filter((p) => p.district === district && p.status === "klar").length;
  const mine = count(s.portfolio);
  let others = count(s.listings);
  for (const c of s.competitors) others += count(c.portfolio ?? []);
  const total = mine + others;
  return total >= 6 ? mine / total : 0;
}

/* ── B5: Fastighetskrisen ──────────────────────────────────────────── */

export const CRISIS_MONTHS = 14;

/** Bubbla som spricker: kris utlöses när bust inleds i ett uppblåst läge. */
export function shouldTriggerCrisis(marketMod: number, rand: number): boolean {
  return marketMod > 1.12 && rand < 0.6;
}

/* ── C6: Megaprojekt ───────────────────────────────────────────────── */

export interface MegaProject {
  id: string;
  name: string;
  icon: string;
  cost: number;
  months: number;
  dynasty: number;
  devBoost: number;
  reputation: number;
  desc: string;
}

export const MEGA_PROJECTS: MegaProject[] = [
  {
    id: "arena",
    name: "Imperium Arena",
    icon: "🏟️",
    cost: 350_000_000,
    months: 36,
    dynasty: 400,
    devBoost: 0.15,
    reputation: 10,
    desc: "Evenemangsarena som sätter staden på kartan.",
  },
  {
    id: "campus",
    name: "Universitetscampus",
    icon: "🎓",
    cost: 500_000_000,
    months: 48,
    dynasty: 600,
    devBoost: 0.2,
    reputation: 12,
    desc: "Fakulteter, studentliv och forskning i världsklass.",
  },
  {
    id: "sjukhus",
    name: "Sjukhuskvarteret",
    icon: "🏥",
    cost: 800_000_000,
    months: 60,
    dynasty: 900,
    devBoost: 0.25,
    reputation: 15,
    desc: "Regionens nya universitetssjukhus – ditt livsverk.",
  },
];

/* ── Ägarens privatliv: lyx & donationer för utdelningen ───────────── */

export interface Luxury {
  id: string;
  name: string;
  icon: string;
  cost: number;
  dynasty: number;
  reputation?: number;
  desc: string;
}

export const LUXURIES: Luxury[] = [
  { id: "sportbil", name: "Italiensk sportbil", icon: "🏎️", cost: 3_000_000, dynasty: 15, desc: "Kryssar utanför huvudkontoret – syns på kartan." },
  { id: "villa", name: "Sommarvilla i skärgården", icon: "🏖️", cost: 8_000_000, dynasty: 30, desc: "Faluröd på en skärgårdsö – syns på kartan." },
  { id: "konst", name: "Konstsamling", icon: "🖼️", cost: 12_000_000, dynasty: 45, reputation: 1, desc: "Nordisk modernism. Lånas ut till stadens museum." },
  { id: "vingard", name: "Vingård i Toscana", icon: "🍇", cost: 20_000_000, dynasty: 60, desc: "Årgångarna etiketteras med bolagets vapen." },
  { id: "yacht", name: "M/Y Imperium", icon: "🛥️", cost: 30_000_000, dynasty: 100, reputation: 2, desc: "Ligger förtöjd i Hamnen – syns på kartan." },
  { id: "helikopter", name: "Privat helikopter", icon: "🚁", cost: 45_000_000, dynasty: 150, reputation: 3, desc: "Står på kontorets helipad – syns på kartan." },
  { id: "flygel", name: "Donation: universitetsflygel", icon: "🏛️", cost: 50_000_000, dynasty: 200, reputation: 5, desc: "Ditt namn över entrén, för alltid." },
  { id: "stiftelse", name: "Välgörenhetsstiftelse", icon: "💛", cost: 100_000_000, dynasty: 400, reputation: 8, desc: "Stipendier, bostäder och forskning i familjens namn." },
];

/* ── C7: Dynastipoäng ──────────────────────────────────────────────── */

export interface DynastyBreakdown {
  utdelningar: number;
  lyxOchDonationer: number;
  megaprojekt: number;
  esg: number;
  nojdhet: number;
  reglerat: number;
  total: number;
  grade: "E" | "C" | "B" | "A" | "S";
  gradeLabel: string;
}

export function dynastyScore(s: GameState): DynastyBreakdown {
  const utdelningar = Math.round((s.dividendsPaid ?? 0) / 2_000_000);
  const lyxOchDonationer = (s.ownerLuxuries ?? []).reduce(
    (a, id) => a + (LUXURIES.find((l) => l.id === id)?.dynasty ?? 0),
    0,
  );
  const megaprojekt = (s.megaCompleted ?? []).reduce(
    (a, id) => a + (MEGA_PROJECTS.find((m) => m.id === id)?.dynasty ?? 0),
    0,
  );
  const esgLetter = esgRatingOf(s).letter;
  const esg = esgLetter === "A" ? 150 : esgLetter === "B" ? 75 : 0;
  const klara = s.portfolio.filter((p) => p.status === "klar");
  const tenants = klara.flatMap((p) => p.tenants);
  const avgSat = tenants.length
    ? tenants.reduce((a, t) => a + (t.satisfaction ?? 60), 0) / tenants.length
    : 0;
  const nojdhet = avgSat >= 70 ? 100 : avgSat >= 55 ? 40 : 0;
  const reglerat = klara.filter((p) => p.regulated).length * 10;
  const total = utdelningar + lyxOchDonationer + megaprojekt + esg + nojdhet + reglerat;
  const grade = total >= 1000 ? "S" : total >= 600 ? "A" : total >= 300 ? "B" : total >= 100 ? "C" : "E";
  const gradeLabel =
    grade === "S" ? "Dynasti – staden bär ditt namn"
    : grade === "A" ? "Patriark – ett bestående arv"
    : grade === "B" ? "Mecenat – staden minns dig"
    : grade === "C" ? "Framgångsrik – men vad lämnar du efter dig?"
    : "Kapitalist – pengarna dog med bolaget";
  return { utdelningar, lyxOchDonationer, megaprojekt, esg, nojdhet, reglerat, total, grade, gradeLabel };
}
