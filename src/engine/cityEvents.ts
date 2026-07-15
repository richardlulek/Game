/* ============================================================
   Stadshändelser – tillfälliga skeenden som spelar på symbiosen
   mellan fastigheterna och industrierna:

   · Stadsmässan     hotellen fylls, butikerna säljer mer
   · Sommarfestival  som mässan men mindre, bara juni–augusti
   · Hamnstrejk      terminalgodset halveras
   · Elpriskaos      spotpriset rusar: energiparker tjänar storkovan,
                     fastigheternas driftkostnad stiger – egen el är hedgen

   En händelse i taget, 1–2 månader. Ren logik utan React-beroenden.
   ============================================================ */

import type { GameState, LogEntry } from "./types";

export interface CityEventDef {
  id: string;
  name: string;
  icon: string;
  months: number;
  startText: string;
  endText: string;
  /** Bara vissa månader (t.ex. festival på sommaren). */
  monthsAllowed?: number[];
  weight: number;
}

export const CITY_EVENTS: CityEventDef[] = [
  {
    id: "massa",
    name: "Stadsmässan",
    icon: "🎪",
    months: 1,
    weight: 3,
    startText: "STADSMÄSSAN öppnar! Hotellen fylls av utställare och butikerna av besökare.",
    endText: "Stadsmässan har packat ihop – hotell och handel återgår till vardagen.",
  },
  {
    id: "festival",
    name: "Sommarfestivalen",
    icon: "🎸",
    months: 1,
    weight: 3,
    monthsAllowed: [6, 7, 8],
    startText: "SOMMARFESTIVAL! Staden sjuder – hotellnätter och butiksflöden lyfter.",
    endText: "Festivalen är över; scenerna monteras ner.",
  },
  {
    id: "hamnstrejk",
    name: "Hamnstrejken",
    icon: "🚧",
    months: 2,
    weight: 2,
    startText: "HAMNSTREJK: godsflödena halveras – terminalernas kontraktsintäkter pressas.",
    endText: "Hamnstrejken är avblåst – godset rullar igen.",
  },
  {
    id: "elkris",
    name: "Elpriskaoset",
    icon: "⚡",
    months: 2,
    weight: 2,
    startText: "ELPRISKAOS: spotpriset rusar. Energiparker tjänar storkovan – fastigheternas driftkostnader stiger (+8 %). Egen el är hedgen.",
    endText: "Elpriserna har normaliserats.",
  },
];

const active = (s: GameState, id: string) =>
  s.cityEvent?.id === id && s.cityEvent.monthsLeft > 0;

/** Hotellens beläggningsfaktor under stadshändelser. */
export const cityEventHotelMult = (s: GameState) =>
  active(s, "massa") ? 1.35 : active(s, "festival") ? 1.25 : 1;

/** Butikernas hyrespotential under stadshändelser (besöksflöden). */
export const cityEventShopMult = (s: GameState) =>
  active(s, "massa") ? 1.10 : active(s, "festival") ? 1.06 : 1;

/** Terminalernas godsflöde. */
export const cityEventLogisticsMult = (s: GameState) =>
  active(s, "hamnstrejk") ? 0.5 : 1;

/** Elspotpriset. */
export const cityEventSpotMult = (s: GameState) =>
  active(s, "elkris") ? 1.8 : 1;

/** Fastigheternas driftkostnad (dyr el). */
export const cityEventOpexMult = (s: GameState) =>
  active(s, "elkris") ? 1.08 : 1;

/** Månadstick: räknar ner pågående händelse och lottar fram nya (~4 %/mån). */
export function tickCityEvent(s: GameState, events: LogEntry[], rand: () => number = Math.random): void {
  if (s.cityEvent && s.cityEvent.monthsLeft > 0) {
    const next = s.cityEvent.monthsLeft - 1;
    if (next <= 0) {
      const def = CITY_EVENTS.find((e) => e.id === s.cityEvent!.id);
      if (def) events.push({ t: `${def.icon} ${def.endText}`, kind: "info" });
      s.cityEvent = undefined;
    } else {
      s.cityEvent = { ...s.cityEvent, monthsLeft: next };
    }
    return;
  }
  if (rand() >= 0.04) return;
  const pool = CITY_EVENTS.filter((e) => !e.monthsAllowed || e.monthsAllowed.includes(s.month));
  if (pool.length === 0) return;
  const total = pool.reduce((a, e) => a + e.weight, 0);
  let r = rand() * total;
  for (const def of pool) {
    r -= def.weight;
    if (r > 0) continue;
    s.cityEvent = { id: def.id, name: def.name, monthsLeft: def.months };
    events.push({ t: `${def.icon} ${def.startText}`, kind: "event" });
    return;
  }
}
