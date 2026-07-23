/* ============================================================
   Hyresgästernas livscykel (tunna delar 7/7). Uthyrning 2.0 gav
   hyresgästerna namn och nöjdhet, men de förblev siffror. Här får
   de mänskliga ögonblick: en pelare i huset som stannat i åratal,
   och små livshändelser (barn, expansion, jubileum) som gör att
   NÅGON bor där – inte bara en rad i en tabell.

   Ren logik, inga React-beroenden.
   ============================================================ */

import type { Property, Tenant } from "./types";

/** Månaders trogen boende innan en nöjd hyresgäst blir veteran (pelare). */
export const VETERAN_MONTHS = 60;
/** Nöjdhet som krävs för att bli veteran. */
export const VETERAN_SATISFACTION = 70;
/** Veteranens rabatt på konkursrisken (utöver den vanliga lojaliteten). */
export const VETERAN_RISK_MULT = 0.6;

/** Har hyresgästen just korsat veterantröskeln denna månad? */
export function becomesVeteran(t: Tenant, consMonths: number): boolean {
  return !t.veteran && consMonths >= VETERAN_MONTHS && (t.satisfaction ?? 60) >= VETERAN_SATISFACTION;
}

/** En livshändelse: mänsklig loggrad + liten nöjdhetsknuff. Returnerar
 *  null de flesta månader – det är ögonblicken som räknas, inte bruset. */
export interface TenantLifeEvent {
  text: string;
  satDelta: number;
}

const RESIDENTIAL_JOYS = [
  "welcomes a new baby and asks about the vacant flat upstairs",
  "celebrates a decade in the neighborhood",
  "repaints the stairwell on their own initiative — the neighbors love it",
  "starts a residents' garden on the courtyard",
];
const COMMERCIAL_WINS = [
  "lands a big contract and hangs a new sign",
  "wins a local business award",
  "opens a second counter and hires three staff",
  "celebrates its busiest quarter yet",
];

/** Ger en livshändelse för hyresgästen om rullen slår igenom (roll < 0.012).
 *  `roll` och `pick` (0–1) injiceras så motorn kan hålla determinism. */
export function tenantLifeEvent(
  t: Tenant,
  p: Property,
  roll: number,
  pick: number,
): TenantLifeEvent | null {
  // Bara någorlunda nöjda, etablerade hyresgäster får ögonblick.
  if ((t.satisfaction ?? 60) < 55 || (t.consecutiveMonths ?? 0) < 6) return null;
  if (roll >= 0.012) return null;
  const pool = p.type === "bostad" ? RESIDENTIAL_JOYS : COMMERCIAL_WINS;
  const line = pool[Math.floor(pick * pool.length) % pool.length];
  return {
    text: `🙂 ${t.name} in ${p.districtName} ${line}.`,
    satDelta: 3,
  };
}
