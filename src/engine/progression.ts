/* ============================================================
   Progression – forskning (koncernövergripande teknik) och
   anställda (chefer med löner och kompetensnivåer). Effekterna
   aggregeras till globala modifierare som övriga formler läser.
   Ren logik, inga React-beroenden.
   ============================================================ */

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
  { id: "gron_energi",   name: "Grön energi",          desc: "Solceller och värmeåtervinning i hela beståndet.", cost: 1_500_000, months: 6,  effect: "−15 % driftkostnad" },
  { id: "modulbygge",    name: "Modulbyggnation",      desc: "Prefabricerade moduler kortar byggtid och kostnad.", cost: 2_200_000, months: 8,  effect: "−20 % byggkostnad · −2 mån byggtid" },
  { id: "datauthyrning", name: "Datadriven uthyrning", desc: "Analys matchar hyresgäster snabbare.", cost: 1_800_000, months: 7,  effect: "−25 % vakans" },
  { id: "finansstyrka",  name: "Finansiell styrka",    desc: "Stärkt balansräkning ger bättre lånevillkor.", cost: 2_600_000, months: 9,  effect: "−0,4 % räntepåslag" },
  { id: "smart_forvalt", name: "Smart förvaltning",    desc: "Sensorer och prediktivt underhåll.", cost: 1_400_000, months: 6,  effect: "−8 % driftkostnad · långsammare slitage" },
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
  { id: "forvaltning", name: "Förvaltningschef", desc: "Effektiviserar driften av beståndet.", baseSalary: 24_000, maxLevel: 3, effect: "−4 % driftkostnad / nivå" },
  { id: "cfo",         name: "Finanschef (CFO)", desc: "Förhandlar bättre lånevillkor.",       baseSalary: 34_000, maxLevel: 3, effect: "−0,15 % räntepåslag / nivå" },
  { id: "inkop",       name: "Inköpschef",       desc: "Vassare i förhandlingar och bud.",       baseSalary: 22_000, maxLevel: 3, effect: "+5 %-enh. budacceptans / nivå" },
  { id: "analys",      name: "Analytiker",       desc: "Bättre urval sänker vakans.",            baseSalary: 20_000, maxLevel: 3, effect: "−3 % vakans / nivå" },
  { id: "marknad",     name: "Marknadschef",     desc: "Stärker varumärket månad för månad.",    baseSalary: 23_000, maxLevel: 3, effect: "+0,3 reputation / mån / nivå" },
];

const lvl = (s: GameState, role: string) => (s.staff?.[role] ?? 0);
const has = (s: GameState, id: string) => (s.researchDone ?? []).includes(id);

/** Multiplikator på driftkostnad (forskning + förvaltningschef). */
export function opexMult(s: GameState): number {
  let m = 1;
  if (has(s, "gron_energi")) m *= 0.85;
  if (has(s, "smart_forvalt")) m *= 0.92;
  m *= 1 - 0.04 * lvl(s, "forvaltning");
  return m;
}

/** Multiplikator på vakans (forskning + analytiker). */
export function vacancyMult(s: GameState): number {
  let m = 1;
  if (has(s, "datauthyrning")) m *= 0.75;
  m *= 1 - 0.03 * lvl(s, "analys");
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
  d += 0.15 * lvl(s, "cfo");
  return d;
}

/** Bonus till budacceptans (inköpschef), i sannolikhetsenheter. */
export function bidBonus(s: GameState): number {
  return 0.05 * lvl(s, "inkop");
}

/** Reputation per månad (marknadschef). */
export function monthlyReputation(s: GameState): number {
  return 0.3 * lvl(s, "marknad");
}

/** Långsammare slitage om smart förvaltning är utforskat. */
export function wearMult(s: GameState): number {
  return has(s, "smart_forvalt") ? 0.7 : 1;
}

/** Total lönekostnad per månad. */
export function salariesTotal(s: GameState): number {
  return STAFF_ROLES.reduce((a, r) => a + r.baseSalary * lvl(s, r.id), 0);
}

/** Engångskostnad för att anställa/befordra till nästa nivå. */
export function hireFee(role: string, nextLevel: number): number {
  const r = STAFF_ROLES.find((x) => x.id === role);
  return r ? r.baseSalary * nextLevel : 0;
}
