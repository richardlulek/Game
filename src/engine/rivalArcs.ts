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
