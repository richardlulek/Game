/* ============================================================
   Progression – forskning (koncernövergripande teknik) och
   anställda (chefer med löner och kompetensnivåer). Effekterna
   aggregeras till globala modifierare som övriga formler läser.
   Ren logik, inga React-beroenden.
   ============================================================ */

import { execSalaryMult, talentOf } from "./executives";
import type { GameState } from "./types";

export interface ResearchDef {
  id: string;
  name: string;
  desc: string;
  cost: number;   // engångskostnad i kr
  months: number; // utvecklingstid
  effect: string; // kort effekttext
}

/** Forskningsträd – ett projekt i taget, permanent effekt när klart. */
export const RESEARCH: ResearchDef[] = [
  { id: "gron_energi",   name: "Green energy",          desc: "Solar panels and heat recovery across the portfolio.", cost: 1_500_000, months: 6,  effect: "−15% operating cost" },
  { id: "modulbygge",    name: "Modular construction",  desc: "Prefabricated modules cut build time and cost.", cost: 2_200_000, months: 8,  effect: "−20% build cost · −2 mo build time" },
  { id: "datauthyrning", name: "Data-driven leasing",   desc: "Analytics match tenants faster.", cost: 1_800_000, months: 7,  effect: "−25% vacancy" },
  { id: "finansstyrka",  name: "Financial strength",    desc: "A stronger balance sheet earns better loan terms.", cost: 2_600_000, months: 9,  effect: "−0.4% rate spread" },
  { id: "smart_forvalt", name: "Smart management",      desc: "Sensors and predictive maintenance.", cost: 1_400_000, months: 6,  effect: "−8% operating cost · slower wear" },
  // Industrisektorer
  { id: "revpro_ai",     name: "Revenue Management AI",    desc: "Dynamic pricing optimizes hotel revenue.", cost: 2_000_000, months: 7, effect: "+15% ADR for all hotels" },
  { id: "grid_opt",      name: "Smart grid optimization",  desc: "Maximizes energy sales on the spot market.",  cost: 1_800_000, months: 6, effect: "+12% spot revenue · −0.5%/yr degradation" },
  { id: "warehouse_sim", name: "Digital twin – warehouse", desc: "Simulates and optimizes warehouse layout.",   cost: 1_600_000, months: 5, effect: "+10% throughput · −8% SLA risk" },
  { id: "green_cert",    name: "ISO 14001 certification",  desc: "Certification for the whole group.",          cost: 1_200_000, months: 4, effect: "−5% opex all sectors · Reputation +8" },
];

export interface StaffRole {
  id: string;
  name: string;
  desc: string;
  baseSalary: number; // per nivå och månad
  maxLevel: number;
  effect: string;
}

/** Anställningsbara chefer. Högre nivå = större effekt och lön. */
export const STAFF_ROLES: StaffRole[] = [
  { id: "forvaltning",     name: "Head of Management",  desc: "Streamlines operation of the portfolio.",     baseSalary: 24_000, maxLevel: 3, effect: "−4% operating cost / level" },
  { id: "cfo",             name: "CFO",                 desc: "Negotiates better loan terms.",               baseSalary: 34_000, maxLevel: 3, effect: "−0.15% rate spread / level" },
  { id: "inkop",           name: "Head of Acquisitions",desc: "Sharper in negotiations and bids.",           baseSalary: 22_000, maxLevel: 3, effect: "+5 pts bid acceptance / level" },
  { id: "analys",          name: "Analyst",             desc: "Better selection lowers vacancy.",            baseSalary: 20_000, maxLevel: 3, effect: "−3% vacancy / level" },
  { id: "marknad",         name: "Head of Marketing",   desc: "Builds the brand month by month.",            baseSalary: 23_000, maxLevel: 3, effect: "+0.3 reputation / mo / level" },
  { id: "hotelldirektör",  name: "Hotel Director",      desc: "Raises RevPAR and guest satisfaction across hotels.", baseSalary: 38_000, maxLevel: 3, effect: "+5% RevPAR / level" },
  { id: "energianalytiker",name: "Energy Analyst",      desc: "Optimizes spot sales and PPA terms.",         baseSalary: 29_000, maxLevel: 3, effect: "+8% spot revenue / level" },
  { id: "logistikchef",    name: "Head of Logistics",   desc: "Streamlines logistics flows and contracts.",  baseSalary: 31_000, maxLevel: 3, effect: "+6% throughput / level" },
];

const lvl = (s: GameState, role: string) => (s.staff?.[role] ?? 0);
const has = (s: GameState, id: string) => (s.researchDone ?? []).includes(id);

/** Multiplikator på driftkostnad (forskning + förvaltningschef). */
export function opexMult(s: GameState): number {
  let m = 1;
  if (has(s, "gron_energi")) m *= 0.85;
  if (has(s, "smart_forvalt")) m *= 0.92;
  if (has(s, "green_cert")) m *= 0.95;
  m *= 1 - 0.04 * lvl(s, "forvaltning") * talentOf(s, "forvaltning");
  return m;
}

/** Multiplikator på vakans (forskning + analytiker). */
export function vacancyMult(s: GameState): number {
  let m = 1;
  if (has(s, "datauthyrning")) m *= 0.75;
  m *= 1 - 0.03 * lvl(s, "analys") * talentOf(s, "analys");
  return Math.max(0.4, m);
}

/** Multiplikator på byggkostnad (forskning + råvaruläge). */
export function buildCostMult(s: GameState): number {
  let m = s.buildCostMod ?? 1;
  if (has(s, "modulbygge")) m *= 0.8;
  return m;
}

/** Förändring av byggtid i månader (forskning). */
export function buildMonthsDelta(s: GameState): number {
  return has(s, "modulbygge") ? -2 : 0;
}

/** Avdrag på räntepåslag (forskning + CFO), procentenheter. */
export function spreadDelta(s: GameState): number {
  let d = 0;
  if (has(s, "finansstyrka")) d += 0.4;
  d += 0.15 * lvl(s, "cfo") * talentOf(s, "cfo");
  return d;
}

/** Bonus till budacceptans (inköpschef), i sannolikhetsenheter. */
export function bidBonus(s: GameState): number {
  return 0.05 * lvl(s, "inkop") * talentOf(s, "inkop");
}

/** Reputation per månad (marknadschef). */
export function monthlyReputation(s: GameState): number {
  return 0.3 * lvl(s, "marknad") * talentOf(s, "marknad");
}

/** Långsammare slitage om smart förvaltning är utforskat. */
export function wearMult(s: GameState): number {
  return has(s, "smart_forvalt") ? 0.7 : 1;
}

/** Total lönekostnad per månad. Namngivna chefers talang (och
 *  matchade rekryteringsstrider) skalar lönen – se executives.ts. */
export function salariesTotal(s: GameState): number {
  return STAFF_ROLES.reduce(
    (a, r) => a + Math.round(r.baseSalary * lvl(s, r.id) * execSalaryMult(s.executives?.[r.id])),
    0,
  );
}

// ── Industrisektors-modifierare ────────────────────────────────────────────

/** RevPAR-boost från hotelldirektör och Revenue Management AI. */
export function hotelRevParBoost(s: GameState): number {
  let boost = 1 + 0.05 * lvl(s, "hotelldirektör") * talentOf(s, "hotelldirektör");
  if (has(s, "revpro_ai")) boost += 0.15;
  return boost;
}

/** Spot-intäktsboost från energianalytiker och nätoptimering. */
export function energySpotBoost(s: GameState): number {
  return 1 + 0.08 * lvl(s, "energianalytiker") * talentOf(s, "energianalytiker") + (has(s, "grid_opt") ? 0.12 : 0);
}

/** Throughput-boost från logistikchef och digital tvilling. */
export function logisticsThroughputBoost(s: GameState): number {
  return 1 + 0.06 * lvl(s, "logistikchef") * talentOf(s, "logistikchef") + (has(s, "warehouse_sim") ? 0.10 : 0);
}

/** Opex-multiplikator för industritillgångar (green_cert). */
export function industryOpexMult(s: GameState): number {
  return has(s, "green_cert") ? 0.95 : 1.0;
}

/** Engångskostnad för att anställa/befordra till nästa nivå. */
export function hireFee(role: string, nextLevel: number): number {
  const r = STAFF_ROLES.find((x) => x.id === role);
  return r ? r.baseSalary * nextLevel : 0;
}
