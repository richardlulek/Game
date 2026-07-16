/* ============================================================
   Hyresgästbetyg – ett publikt "Tenant Score" som väger samman
   nöjdhet, lojalitet, presstemperatur (klagomål/vräkningar) och
   vakans till ETT synligt betyg (A–F). Betyget är ett rykte i sig:
   det knuffar reputation långsamt och göder eller dämpar skandaler.
   Ren logik, inga React-beroenden.
   ============================================================ */

import type { GameState, Tenant } from "./types";

export interface TenantScore {
  /** 0–100. */
  score: number;
  letter: "A" | "B" | "C" | "D" | "E" | "F";
  /** Kort etikett ("Beloved landlord" … "Slumlord"). */
  label: string;
  /** Antal hyresgäster betyget bygger på (0 = neutralt utgångsläge). */
  tenants: number;
  /** Delkomponenter för UI-transparens. */
  breakdown: {
    avgSatisfaction: number;
    loyaltyBonus: number;
    complaintPenalty: number;
    vacancyPenalty: number;
  };
}

const BANDS: { min: number; letter: TenantScore["letter"]; label: string }[] = [
  { min: 85, letter: "A", label: "Beloved landlord" },
  { min: 70, letter: "B", label: "Well regarded" },
  { min: 55, letter: "C", label: "Fair" },
  { min: 40, letter: "D", label: "Strained" },
  { min: 25, letter: "E", label: "Resented" },
  { min: 0,  letter: "F", label: "Slumlord" },
];

function bandFor(score: number): { letter: TenantScore["letter"]; label: string } {
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}

/** Portföljens vakans (0–1) på färdiga fastigheter. */
function vacancyOf(state: GameState): number {
  const done = state.portfolio.filter((p) => p.status === "klar");
  const cap = done.reduce((a, p) => a + p.capacity, 0);
  const occ = done.reduce((a, p) => a + p.tenants.length, 0);
  return cap > 0 ? 1 - occ / cap : 0;
}

const isLoyal = (t: Tenant): boolean => (t.consecutiveMonths ?? 0) >= 24 || !!t.isAnchor;

/**
 * Publikt hyresgästbetyg. Bygger på snittnöjdheten och justeras av:
 *  · lojalitet (långvariga hyresgäster/ankare) — upp till +6,
 *  · presstemperatur (färska vräkningar/hyreshöjningar) — klagomål drar ned,
 *  · vakans — tomma hus signalerar en likgiltig hyresvärd.
 * Utan hyresgäster ges ett neutralt utgångsläge (68 → "Fair/Well regarded"),
 * så en nystartare inte stämplas som slumvärd innan spelet börjat.
 */
export function tenantScoreOf(state: GameState): TenantScore {
  const tenants = state.portfolio.flatMap((p) => p.tenants);
  if (tenants.length === 0) {
    const b = bandFor(68);
    return {
      score: 68,
      letter: b.letter,
      label: b.label,
      tenants: 0,
      breakdown: { avgSatisfaction: 68, loyaltyBonus: 0, complaintPenalty: 0, vacancyPenalty: 0 },
    };
  }

  const avgSatisfaction =
    tenants.reduce((a, t) => a + (t.satisfaction ?? 60), 0) / tenants.length;
  const loyalShare = tenants.filter(isLoyal).length / tenants.length;
  const loyaltyBonus = +(loyalShare * 6).toFixed(1);
  const complaintPenalty = +Math.min(30, (state.pressHeat ?? 0) * 1.5).toFixed(1);
  const vac = vacancyOf(state);
  const vacancyPenalty = vac > 0.2 ? +Math.min(15, (vac - 0.2) * 30).toFixed(1) : 0;

  const raw = avgSatisfaction + loyaltyBonus - complaintPenalty - vacancyPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const b = bandFor(score);
  return {
    score,
    letter: b.letter,
    label: b.label,
    tenants: tenants.length,
    breakdown: {
      avgSatisfaction: Math.round(avgSatisfaction),
      loyaltyBonus,
      complaintPenalty,
      vacancyPenalty,
    },
  };
}
