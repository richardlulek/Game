/* ============================================================
   Notabla hyresgäster – en handfull namngivna karaktärer som kan
   flytta in i dina lokaler, växa, rekommendera andra och stanna
   lojala eller lämna i vredesmod. De ger hyresgästbeståndet ansikten
   och en liten berättelse, på samma sätt som rivalpersonas ger
   konkurrenterna det.
   Använder den seedade PRNG:n (random01/pick) precis som övriga
   simuleringshjälpare, så förlopp är deterministiska.
   ============================================================ */

import { pick, random01 } from "./random";
import type { GameState, PropTypeKey, Tenant } from "./types";

export type NotableTrait = "prestige" | "growth" | "loyal" | "fickle";

export interface NotableTenant {
  id: string;
  name: string;
  /** Vilken lokaltyp karaktären söker. */
  kind: PropTypeKey;
  /** En rad för tidningen när de flyttar in. */
  bio: string;
  trait: NotableTrait;
  /** Hyres-/kvalitetspremie (0.9–1.4). */
  quality: number;
}

export const NOTABLE_TENANTS: NotableTenant[] = [
  { id: "lumiere",   name: "Lumière Brasserie",     kind: "butik",    trait: "prestige", quality: 1.35, bio: "a Michelin-starred restaurant that turns a street into a destination" },
  { id: "meridian",  name: "Meridian Capital",      kind: "kontor",   trait: "loyal",    quality: 1.30, bio: "a blue-chip asset manager that signs long and pays on time" },
  { id: "novapod",   name: "NovaPod",               kind: "kontor",   trait: "growth",   quality: 1.15, bio: "a fast-scaling tech startup forever outgrowing its floor" },
  { id: "atelier",   name: "Atelier Nord",          kind: "butik",    trait: "prestige", quality: 1.20, bio: "a celebrated design house whose flagship draws crowds" },
  { id: "harbor_co", name: "Harbor & Co. Roasters", kind: "butik",    trait: "loyal",    quality: 1.10, bio: "a beloved neighborhood roastery that anchors a corner for years" },
  { id: "vireo",     name: "Vireo Studios",         kind: "industri", trait: "growth",   quality: 1.05, bio: "a booming game studio hungry for warehouse space" },
  { id: "aria",      name: "Aria Chamber Ensemble", kind: "bostad",   trait: "prestige", quality: 1.25, bio: "an acclaimed ensemble whose residency lends the block cachet" },
  { id: "kestrel",   name: "Kestrel & Vane",        kind: "kontor",   trait: "fickle",   quality: 1.20, bio: "a mercurial ad agency that chases the trendiest address" },
];

export function notableById(id: string | undefined): NotableTenant | undefined {
  return id ? NOTABLE_TENANTS.find((n) => n.id === id) : undefined;
}

/** Id:n på notabla hyresgäster som redan bor i portföljen. */
export function housedNotables(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const p of state.portfolio) for (const t of p.tenants) if (t.notableId) out.add(t.notableId);
  return out;
}

/** Kontraktslängd i månader per läggning (lojala stannar längst). */
function termFor(trait: NotableTrait): number {
  switch (trait) {
    case "loyal": return 60;
    case "prestige": return 48;
    case "growth": return 36;
    case "fickle": return 24;
  }
}

/**
 * Bygger den signerade hyresgästen för en notabel karaktär i en lokal med
 * given marknadshyra per plats/månad. Notabla betalar en premie (quality),
 * flyttar in nöjda och räknas som ankare (utom de nyckfulla).
 */
export function signNotable(n: NotableTenant, slotMarketRent: number): Tenant {
  const term = termFor(n.trait);
  return {
    id: Math.floor(random01() * 1e9),
    profile: "notabel",
    name: n.name,
    profileName: "Notable tenant",
    quality: n.quality,
    defaultRisk: n.trait === "fickle" ? 0.02 : 0.004,
    monthsLeft: term,
    termTotal: term,
    rent: Math.max(1, Math.round(slotMarketRent * n.quality)),
    satisfaction: 72,
    isAnchor: n.trait !== "fickle",
    notableId: n.id,
  };
}

/**
 * Försöker para ihop en ledig notabel karaktär med en passande, ledig lokal.
 * Väljer bland `klar`-fastigheter av rätt typ med hyfsat skick (notabla söker
 * inte ruckel) och en ledig plats. Returnerar null om inget passar.
 */
export function findNotableMoveIn(
  state: GameState,
): { notable: NotableTenant; propertyId: number } | null {
  const housed = housedNotables(state);
  const vacant = state.portfolio.filter(
    (p) => p.status === "klar" && p.condition >= 55 && p.tenants.length < p.capacity,
  );
  // Endast karaktärer som (a) inte redan bor hos dig och (b) har minst en
  // passande ledig lokal – så ett drag verkligen kan genomföras.
  const eligible = NOTABLE_TENANTS.filter(
    (n) => !housed.has(n.id) && vacant.some((p) => p.type === n.kind),
  );
  if (eligible.length === 0) return null;
  const notable = pick(eligible);
  const prop = pick(vacant.filter((p) => p.type === notable.kind));
  return { notable, propertyId: prop.id };
}
