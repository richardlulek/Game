/* ============================================================
   Etapprenovering – att föryngra ett hus som fortfarande är uthyrt.

   Åldrandet i lifecycle.ts hade tidigare EN motvikt som verkligen
   nollställde byggnadsåldern: totalrenoveringen. Den kräver ett helt tomt
   hus, alltså vräkning ("renoviction", med ryktetapp och presstemperatur)
   eller att man väntar ut alla kontrakt. Botemedlet krävde att man först
   rev sönder sin egen intäkt, och i femtioårsmätningarna beställdes det
   fem gånger på tio partier. Ett bestånd som växer men aldrig föryngras.

   Etapprenoveringen tar en lokal i taget. Trapphus för trapphus, precis som
   ett stambyte går till: resten av huset betalar hyra under tiden, och
   hyresgästen i den lokal som byggs bor kvar mot hyresnedsättning.

   Priset för att slippa tömma huset:
     · ~30 % dyrare totalt än totalrenoveringen (ställningar upp och ner,
       omstarter, hantverkare som samsas med boende)
     · längre kalendertid – två månader per lokal
     · en störd hyresgäst per etapp, med risk att den säger upp sig

   Åldern, skicket och hyrespotentialen rör sig PROPORTIONELLT: varje färdig
   etapp stänger sin andel av gapet till noll års ålder, skick 100 och full
   hyresuppgång. Renoverar man halva huset är byggnaden hälften så gammal.
   Därför är det meningsfullt att avbryta halvvägs – till skillnad från
   totalrenoveringen, som är allt eller inget.
   ============================================================ */

import { propMarketValue } from "./property";
import type { GameState, Property } from "./types";

/** Total kostnad som andel av marknadsvärdet (totalrenoveringen: 0.18). */
export const PHASED_COST = 0.24;
/** Månader per lokal. */
export const PHASED_MONTHS_PER_UNIT = 2;
/** Hyresnedsättning för den lokal som byggs om under etappen. */
export const PHASED_RENT_CUT = 0.5;
/** Hyrespotentialens totala lyft när hela huset är genomgånget. */
export const PHASED_RENT_LIFT = 1.15;
/** Nöjdhetstapp för den störda hyresgästen per etapp. */
export const PHASED_SATISFACTION_HIT = 12;
/** Minsta antal lokaler – ett enrumshus går inte att göra i etapper. */
export const PHASED_MIN_UNITS = 2;

/** Kostnaden för EN etapp på huset. */
export function phaseCost(p: Property, state: GameState): number {
  const units = Math.max(1, p.capacity);
  return Math.round((propMarketValue(p, state) * PHASED_COST) / units);
}

/** Hela programmets kostnad – det som visas innan man beställer. */
export function phasedTotalCost(p: Property, state: GameState): number {
  return Math.round(propMarketValue(p, state) * PHASED_COST);
}

/** Kalendertid för hela programmet, i månader. */
export function phasedTotalMonths(p: Property): number {
  return Math.max(1, p.capacity) * PHASED_MONTHS_PER_UNIT;
}

/** Går en etapprenovering att beställa på huset just nu? */
export function canStartPhased(p: Property): boolean {
  if (p.status !== "klar") return false;
  if (p.phased) return false;
  if (p.capacity < PHASED_MIN_UNITS) return false;
  return true;
}

/**
 * Månadens hyresbortfall från den lokal som står under ombyggnad. Noll när
 * inget program pågår. Bortfallet räknas på husets faktiska hyresrulle så en
 * tom lokal inte kostar något extra.
 */
export function phasedRentReduction(p: Property): number {
  if (!p.phased || p.phased.monthsLeft <= 0) return 0;
  const rent = p.tenants.reduce((a, t) => a + t.rent, 0);
  const units = Math.max(1, p.capacity);
  return Math.round((rent / units) * PHASED_RENT_CUT);
}

/**
 * Stänger sin andel av gapet: efter `left` återstående etapper (inklusive
 * den som just blev klar) landar värdet exakt på `target`. Med fyra etapper
 * och 40 års ålder blir stegen 10, 10, 10, 10 – och sista etappen nollar.
 */
function closeGap(current: number, target: number, left: number): number {
  if (left <= 1) return target;
  return current + (target - current) / left;
}

/** Effekten av EN färdig etapp. Ren funktion – anropas av simulationen. */
export function applyPhase(p: Property, state: GameState): Property {
  const ph = p.phased!;
  const left = ph.total - ph.done; // etapper kvar inklusive denna
  const age = Math.max(0, state.year - (p.builtYear ?? state.year));
  const np: Property = {
    ...p,
    // Åldern: stäng andelen av gapet ner till innevarande år.
    builtYear: Math.round(closeGap(state.year - age, state.year, left)),
    condition: Math.min(100, closeGap(p.condition, 100, left)),
    // Hyrespotentialen lyfts jämnt fördelat över etapperna.
    rentMult: +(p.rentMult * Math.pow(PHASED_RENT_LIFT, 1 / ph.total)).toFixed(4),
    phased: { ...ph, done: ph.done + 1, monthsLeft: 0 },
  };
  if (np.phased!.done >= ph.total) {
    // Sista etappen: huset är genomgånget – energiklassen kliver upp och
    // programmet avslutas.
    np.energyClass = "A";
    np.phased = undefined;
  }
  return np;
}
