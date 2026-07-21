/* ============================================================
   Rivalberättelser – nemesis, fejder och allianser. Bygger på
   standing (relationen till dig) och på rivalernas relationer till
   VARANDRA. Ger konkurrenterna pågående historier som speglas i
   tidningen. Ren logik, inga React-beroenden.
   ============================================================ */

import { rivalStanding } from "./standing";
import type { GameState } from "./types";

/** Standing-tröskel då en rival blir din uttalade nemesis. */
export const NEMESIS_THRESHOLD = -40;

/**
 * Din nemesis: den mest fientliga rivalen (standing ≤ tröskeln). Vid lika
 * standing väljs den starkaste (störst eget kapital) – den farligaste fienden.
 * Returnerar null om ingen rival är tillräckligt fientlig.
 */
export function nemesisOf(state: GameState): string | null {
  const ranked = state.competitors
    .map((c) => ({ name: c.name, s: rivalStanding(state, c.name), eq: c.equity }))
    .filter((r) => r.s <= NEMESIS_THRESHOLD)
    .sort((a, b) => a.s - b.s || b.eq - a.eq);
  return ranked[0]?.name ?? null;
}

/** Relationer (allianser/fejder) som rör en viss rival. */
export function relationsFor(state: GameState, name: string) {
  return (state.rivalRelations ?? []).filter((r) => r.a === name || r.b === name);
}

/** Finns redan en relation mellan två rivaler (i någon riktning)? */
export function hasRelation(state: GameState, a: string, b: string): boolean {
  return (state.rivalRelations ?? []).some(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  );
}

/**
 * Konjunkturmedvind/motvind för en rival av dess allianser och fejder:
 * allierade drar nytta av varandra (+3 % per allians), fejdande sinkar
 * varandra (−3 % per fejd). Klampas till ±10 %.
 */
export function rivalCycleMult(state: GameState, name: string): number {
  let m = 1;
  for (const r of relationsFor(state, name)) m += r.kind === "alliance" ? 0.03 : -0.03;
  return Math.max(0.9, Math.min(1.1, +m.toFixed(3)));
}

/* ── Motivdriven M&A (Masterplan fas 3, batch 3) ────────────────────
   Fusioner var ren slump (starkast köper svagast). Nu krävs ett MOTIV:
   ett nödställt byte, en fejd med styrkeövertag, eller en allians som
   vill utmana stadens ledare. Simulationen slår mot planen med en
   sannolikhet per motiv – opportunistiska uppköp oftast, vänskapliga
   fusioner mest sällan. */

export interface MergerPlan {
  buyer: string;
  target: string;
  kind: "opportunistic" | "hostile" | "friendly";
  reason: string;
}

/** Så många ICR-svaga månader gör en rival till uppköpsbyte. */
export const PREY_ICR_MONTHS = 2;
/** Styrkeövertag (equity-kvot) som krävs för fientligt övertagande. */
export const HOSTILE_EQUITY_RATIO = 3;

export function pickMerger(state: GameState): MergerPlan | null {
  // Marknaden ska förbli mångfaldig: ingen konsolidering under 4 aktörer.
  if (state.competitors.length < 4) return null;
  const by = new Map(state.competitors.map((c) => [c.name, c]));

  // 1) Opportunistiskt: ett nödställt bolag (tom kassa eller pressad
  //    räntetäckning) köps av den mest kapitaliserade rivalen.
  const distressed = state.competitors
    .filter((c) => c.cash < 0 || (c.icrBadMonths ?? 0) >= PREY_ICR_MONTHS)
    .sort((a, b) => a.equity - b.equity);
  if (distressed.length > 0) {
    const target = distressed[0];
    const buyer = state.competitors
      .filter((c) => c.name !== target.name && c.cash > Math.max(20_000_000, target.equity * 0.5))
      .sort((a, b) => b.cash - a.cash)[0];
    if (buyer)
      return {
        buyer: buyer.name,
        target: target.name,
        kind: "opportunistic",
        reason: "the interest burden made them easy prey",
      };
  }

  // 2) Fientligt: en fejd där ena parten har brutalt styrkeövertag.
  for (const r of state.rivalRelations ?? []) {
    if (r.kind !== "feud") continue;
    const a = by.get(r.a);
    const b = by.get(r.b);
    if (!a || !b) continue;
    const [big, small] = a.equity >= b.equity ? [a, b] : [b, a];
    if (big.equity >= small.equity * HOSTILE_EQUITY_RATIO && big.cash > small.equity * 0.4)
      return {
        buyer: big.name,
        target: small.name,
        kind: "hostile",
        reason: "the feud ends the old-fashioned way: the bigger fish eats",
      };
  }

  // 3) Vänskapligt: två allierade i mellanskiktet slår ihop sig för att
  //    utmana stadens ledande bolag. Den större parten absorberar.
  const leader = [...state.competitors].sort((x, y) => y.equity - x.equity)[0];
  for (const r of state.rivalRelations ?? []) {
    if (r.kind !== "alliance") continue;
    const a = by.get(r.a);
    const b = by.get(r.b);
    if (!a || !b || a.name === leader.name || b.name === leader.name) continue;
    if (a.equity + b.equity > leader.equity * 0.8) {
      const [big, small] = a.equity >= b.equity ? [a, b] : [b, a];
      return {
        buyer: big.name,
        target: small.name,
        kind: "friendly",
        reason: "the alliance formalizes into one company to challenge the market leader",
      };
    }
  }
  return null;
}

/** Kort etikett för en rivals relationer (för UI), eller null. */
export function relationSummary(state: GameState, name: string): string | null {
  const rels = relationsFor(state, name);
  if (rels.length === 0) return null;
  const partner = (r: { a: string; b: string }) => (r.a === name ? r.b : r.a);
  const allies = rels.filter((r) => r.kind === "alliance").map(partner);
  const feuds = rels.filter((r) => r.kind === "feud").map(partner);
  const parts: string[] = [];
  if (allies.length) parts.push(`allied with ${allies.join(", ")}`);
  if (feuds.length) parts.push(`feuding with ${feuds.join(", ")}`);
  return parts.join(" · ");
}
