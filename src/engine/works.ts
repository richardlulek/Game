/* ============================================================
   Åtgärdskatalogen – vad varje jobb GÖR med huset.

   Spelets arbeten låg tidigare utspridda över tre mekanismer: underhåll
   (MAINTAIN), uppgraderingar (UPGRADE, data.UPGRADES) och utvecklings-
   projekt (START_RENOVATION). De skiljer sig i hur de utförs, men för den
   som ska VÄLJA är den intressanta frågan densamma: vad händer med hyran,
   vad händer med värdet, vad kostar det och när är det betalt?

   Den här modulen är det gemensamma svaret. Både panelerna och portfölj-
   direktören läser härifrån, så det spelaren ser i jämförelsen är exakt de
   tal direktören själv väger när den prioriterar.

   Tre familjer, med olika karaktär – det är hela poängen med att välja:

     · HYRESDRIVANDE  renovering, totalrenovering
       Höjer hyresnivån. Eftersom värderingen är avkastningsbaserad följer
       värdet med, men det tar vägen om hyresrullen: effekten kommer när
       kontrakten skrivs om, inte dagen jobbet är klart.

     · VÄRDEDRIVANDE  fasad, tillbyggnad, påbyggnad
       Höjer värdet direkt – mer yta, fler lokaler, bättre intryck vid
       värderingen. Hyran rör sig mindre eller inte alls.

     · DRIFTDRIVANDE  energiåtgärd, smart fastighet, underhåll
       Rör varken hyra eller värde nämnvärt, men sänker kostnaderna och
       vakansen. Tråkigast och ofta lönsammast.
   ============================================================ */

import { UPGRADES } from "./data";
import { propMarketValue, propPotentialRent } from "./property";
import type { GameState, Property } from "./types";

export type WorkId =
  | "underhåll"
  | "energi"
  | "smart"
  | "fasad"
  | "renovering"
  | "tillbygg"
  | "totalrenovering"
  | "påbyggnad";

export type WorkFamily = "hyra" | "värde" | "drift";

export interface WorkSpec {
  id: WorkId;
  name: string;
  family: WorkFamily;
  /** Kostnad som andel av marknadsvärdet. */
  cost: number;
  months: number;
  /** Utvecklingsprojekt: huset måste vara tomt och står still under tiden. */
  needsVacant: boolean;
  /** Underhåll går att göra om och om igen; övriga en gång per hus. */
  repeatable: boolean;
  /** Hyreshöjning som andel (potentiell hyra). */
  rent: number;
  /** Värdehöjning som andel, UTÖVER den som kommer via hyran. */
  value: number;
  /** Skickpoäng. `conditionTo` sätter i stället en nivå. */
  condition: number;
  conditionTo?: number;
  /** Sänkt driftkostnad respektive vakans, som andel. */
  opex: number;
  vacancy: number;
  /** Fler uthyrningsbara lokaler. */
  capacity: number;
  /** En rad om vad man köper. */
  blurb: string;
}

/** Underhållets grundtal – delas med simulationen. */
export const MAINTAIN_COST_SHARE = 0.02;

export const WORKS: WorkSpec[] = [
  {
    id: "underhåll", name: "Maintenance", family: "drift",
    cost: MAINTAIN_COST_SHARE, months: 1, needsVacant: false, repeatable: true,
    rent: 0, value: 0, condition: 15, opex: 0, vacancy: 0, capacity: 0,
    blurb: "Holds the building where it is. Skip it and condition drags rent, vacancy and value down together.",
  },
  {
    id: "energi", name: "Energy retrofit", family: "drift",
    cost: 0.08, months: 1, needsVacant: false, repeatable: false,
    rent: 0.03, value: 0, condition: 10, opex: 0.2, vacancy: 0, capacity: 0,
    blurb: "Cuts operating costs by a fifth and lifts the energy class — the road to a green loan.",
  },
  {
    id: "smart", name: "Smart building", family: "drift",
    cost: 0.06, months: 1, needsVacant: false, repeatable: false,
    rent: 0, value: 0, condition: 0, opex: 0, vacancy: 0.3, capacity: 0,
    blurb: "Fewer empty months. Nothing shows on the rent roll — it shows in how rarely it stands empty.",
  },
  {
    id: "fasad", name: "Facade refurbishment", family: "värde",
    cost: 0.07, months: 2, needsVacant: false, repeatable: false,
    rent: 0.02, value: 0.12, condition: 12, opex: 0, vacancy: 0, capacity: 0,
    blurb: "The valuer walks past the facade before reading the rent roll. Value up, rent barely moves.",
  },
  {
    id: "renovering", name: "Renovation", family: "hyra",
    cost: 0.12, months: 2, needsVacant: false, repeatable: false,
    rent: 0.18, value: 0, condition: 35, opex: 0, vacancy: 0, capacity: 0,
    blurb: "New kitchens and bathrooms carry a higher rent — the value follows through the rent roll.",
  },
  {
    id: "tillbygg", name: "Extension", family: "värde",
    cost: 0.22, months: 3, needsVacant: false, repeatable: false,
    rent: 0.1, value: 0.25, condition: 0, opex: 0, vacancy: 0, capacity: 0,
    blurb: "More square metres. The biggest single lift in value that leaves the tenants in place.",
  },
  {
    id: "totalrenovering", name: "Full renovation", family: "hyra",
    cost: 0.18, months: 6, needsVacant: true, repeatable: false,
    rent: 0.15, value: 0, condition: 0, conditionTo: 100, opex: 0, vacancy: 0, capacity: 0,
    blurb: "Pipes, roof and frame at once: condition 100, energy class A, the building's age reset. Everyone has to move out first.",
  },
  {
    id: "påbyggnad", name: "Extra floor", family: "värde",
    cost: 0.3, months: 10, needsVacant: true, repeatable: false,
    rent: 0.25, value: 0.2, condition: 0, opex: 0, vacancy: 0, capacity: 1,
    blurb: "The building rises a floor: +25% area, one more unit, +20% value. Ten months of no rent at all.",
  },
];

const BY_ID = new Map(WORKS.map((w) => [w.id, w]));

export function workSpec(id: WorkId): WorkSpec | undefined {
  return BY_ID.get(id);
}

/** Kostnaden i kronor för ett jobb på en viss fastighet. */
export function workCost(p: Property, state: GameState, id: WorkId): number {
  const w = BY_ID.get(id);
  if (!w) return 0;
  if (id === "påbyggnad") return Math.round(propMarketValue(p, state) * w.cost);
  return Math.round(propMarketValue(p, state) * w.cost);
}

/** Är jobbet redan gjort (eller pågående) på huset? */
export function workDone(p: Property, id: WorkId): boolean {
  const w = BY_ID.get(id);
  if (!w || w.repeatable) return false;
  if (id === "totalrenovering" || id === "påbyggnad") return false; // går att göra om
  return p.upgrades.includes(id);
}

/** Kan jobbet beställas på huset just nu? Rena förutsättningar – kassan
 *  prövas av den som beställer. */
export function workAvailable(p: Property, id: WorkId): boolean {
  const w = BY_ID.get(id);
  if (!w) return false;
  if (p.status !== "klar") return false;
  if (workDone(p, id)) return false;
  if ((p.pendingWorks ?? []).length > 0) return false;
  if (w.needsVacant && p.tenants.length > 0) return false;
  return true;
}

/** Ökad årshyra i kronor om jobbet görs. */
export function workRentUplift(p: Property, state: GameState, id: WorkId): number {
  const w = BY_ID.get(id);
  if (!w) return 0;
  const rent = propPotentialRent(p, state);
  const fromRent = rent * w.rent;
  // Fler lokaler bär hyra i sig – kapaciteten räknas ovanpå hyreshöjningen.
  const fromCapacity = w.capacity > 0 && p.capacity > 0 ? (rent / p.capacity) * w.capacity : 0;
  return Math.round(fromRent + fromCapacity);
}

/** Ökat marknadsvärde i kronor om jobbet görs. Både den direkta värde-
 *  effekten och den som kommer via hyran (värderingen är avkastnings-
 *  baserad), samt den lyft som bättre skick ger. */
export function workValueUplift(p: Property, state: GameState, id: WorkId): number {
  const w = BY_ID.get(id);
  if (!w) return 0;
  const value = propMarketValue(p, state);
  const direct = value * w.value;
  const viaRent = value * (w.rent + (w.capacity > 0 && p.capacity > 0 ? w.capacity / p.capacity : 0));
  const target = w.conditionTo ?? Math.min(100, p.condition + w.condition);
  const viaCondition = value * Math.max(0, (target - p.condition) / 100) * 0.35;
  return Math.round(direct + viaRent + viaCondition);
}

/**
 * Återbetalningstid i år: vad jobbet kostar delat på vad det ger per år i
 * ökad hyra och sänkt driftkostnad. Värdehöjningen räknas inte som avkastning
 * – den realiseras först vid försäljning – men den syns bredvid i panelerna.
 * Oändligt när jobbet inte ger något löpande alls.
 */
export function workPaybackYears(p: Property, state: GameState, id: WorkId): number {
  const w = BY_ID.get(id);
  if (!w) return Infinity;
  const cost = workCost(p, state, id);
  const rentGain = workRentUplift(p, state, id);
  const opexGain = w.opex > 0 ? propPotentialRent(p, state) * 0.3 * w.opex : 0;
  const vacancyGain = w.vacancy > 0 ? propPotentialRent(p, state) * 0.08 * w.vacancy : 0;
  const yearly = rentGain + opexGain + vacancyGain;
  if (yearly <= 0) return Infinity;
  return cost / yearly;
}

/**
 * Direktörens rangordning: hur mycket varje satsad krona ger tillbaka, i
 * löpande avkastning plus halva värdehöjningen (halva – den är inte pengar
 * förrän huset säljs). Högre är bättre; 0 eller lägre beställs aldrig.
 */
export function workScore(p: Property, state: GameState, id: WorkId): number {
  const cost = workCost(p, state, id);
  if (cost <= 0) return 0;
  const payback = workPaybackYears(p, state, id);
  const yearly = Number.isFinite(payback) ? cost / payback : 0;
  const valueShare = workValueUplift(p, state, id) * 0.5;
  // Ett tomt hus som står still under ett utvecklingsprojekt tappar inget –
  // men projektets månader utan hyra ska ändå väga emot.
  const w = BY_ID.get(id);
  const idleCost = w?.needsVacant ? (propPotentialRent(p, state) / 12) * w.months * 0.5 : 0;
  return (yearly * 10 + valueShare - idleCost) / cost;
}

/** Åtgärder som motsvarar en post i UPGRADES (beställs som "uppgradering"). */
export function isUpgradeWork(id: WorkId): boolean {
  return UPGRADES.some((u) => u.id === id);
}

/**
 * Renoveringsprogrammet: vad portföljdirektören beställer denna månad, om
 * något. Ett jobb åt gången i hela beståndet – den kombination av hus och
 * åtgärd som ger mest tillbaka per satsad krona bland dem policyn tillåter,
 * och bara så länge kassan stannar över golvet.
 *
 * Underhållet ligger kvar där det hörde hemma (skicktröskeln i fastighets-
 * loopen); det här programmet gäller investeringarna.
 */
export function pickManagerWork(
  state: GameState,
): { propertyId: number; work: WorkId; cost: number } | null {
  const pol = state.policy?.autoWorks;
  if (!pol?.enabled || !state.globalManager?.active) return null;
  const allowed = (pol.allowed ?? []).filter((id): id is WorkId => BY_ID.has(id as WorkId) && id !== "underhåll");
  if (allowed.length === 0) return null;

  let best: { propertyId: number; work: WorkId; cost: number; score: number } | null = null;
  for (const p of state.portfolio) {
    for (const id of allowed) {
      if (!workAvailable(p, id)) continue;
      const cost = workCost(p, state, id);
      if (cost <= 0 || state.cash - cost < pol.cashFloor) continue;
      const score = workScore(p, state, id);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { propertyId: p.id, work: id, cost, score };
    }
  }
  return best ? { propertyId: best.propertyId, work: best.work, cost: best.cost } : null;
}
