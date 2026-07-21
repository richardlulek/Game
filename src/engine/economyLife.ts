/* ============================================================
   Levande ekonomi – Riksbanken, stadens flyttkedjor och
   kommunala infrastrukturprojekt. Ren logik utan React.
   ============================================================ */

import type { GameState } from "./types";

/* ── Riksbanken ─────────────────────────────────────────────────────
   Styrräntan söker sig kvartalsvis mot ett konjunkturstyrt mål i
   steg om 25 punkter. Neutralränta 4 % = värdeneutral nivå. */

/* Styrräntans mål och steg bor numera i centralBank.ts (Taylor-regel
   mot modellerad inflation) – den gamla cykeltabellen är utfasad. */

/** Låg ränta lyfter fastighetsvärden, hög trycker dem (neutral 4 %). */
export function rateValueFactor(interestRate: number): number {
  return Math.max(0.88, Math.min(1.1, 1 + (4 - interestRate) * 0.03));
}

/** Rivalernas köpaptit följer räntan: billiga pengar → fler affärer. */
export function rateAppetite(interestRate: number): number {
  return interestRate <= 3 ? 1.3 : interestRate >= 5 ? 0.7 : 1;
}

/* ── Flyttkedjor ────────────────────────────────────────────────────
   Hyresgästerna ser hela stadens utbud: gott om vakanser gör det
   lätt att flytta (fler avhopp, tuffare förnyelser), tight marknad
   gör att de stannar. */

export function cityVacancyRate(s: GameState): number {
  let slots = 0;
  let vac = 0;
  const count = (cap: number, tenants: number) => {
    slots += cap;
    vac += Math.max(0, cap - tenants);
  };
  for (const p of s.portfolio) if (p.status === "klar") count(p.capacity, p.tenants.length);
  for (const p of s.listings) count(p.capacity, p.tenants.length);
  for (const c of s.competitors)
    for (const p of c.portfolio ?? []) if (p.status === "klar") count(p.capacity, p.tenants.length);
  return slots > 0 ? vac / slots : 0.08;
}

/** >1 = löst läge (lätt att flytta), <1 = tight (hyresgäster stannar). */
export function movePressure(vacancyRate: number): number {
  if (vacancyRate >= 0.14) return 1.35;
  if (vacancyRate >= 0.08) return 1.1;
  if (vacancyRate <= 0.03) return 0.7;
  return 1;
}

/* ── Kommunala infrastrukturprojekt ────────────────────────────────
   Fleråriga byggen som annonseras i förväg och permanent lyfter
   distriktets områdesutveckling när de invigs – den som läser
   tidningen kan spekulera. */

export interface InfraKind {
  name: string;
  boost: [number, number];
  months: [number, number];
}

export const INFRA_KINDS: InfraKind[] = [
  { name: "Tram line", boost: [0.08, 0.12], months: [22, 30] },
  { name: "Commuter rail station", boost: [0.07, 0.1], months: [18, 26] },
  { name: "Ny bro", boost: [0.05, 0.09], months: [20, 28] },
  { name: "Grundskola och idrottshall", boost: [0.04, 0.07], months: [14, 20] },
  { name: "Stadspark vid vattnet", boost: [0.04, 0.06], months: [12, 18] },
];
