/* ============================================================
   Aktiv stadslayout – bytet mellan klassiska kartan och seedade
   städer. EN kontaktpunkt: setActiveCityLayout(seed) genererar
   layouten och muterar alla aktiva konstanter på plats (zoner,
   tomter, gator i engine/city; vägnätet i roadGen; landmärkena i
   landmarkGen). Anropas från spelstartens/laddningens boundary i
   gameStore FÖRE placeCity, och 3D-vyn monteras om via
   key={citySeed} i FastighetsImperium.

   Klassiska kartan är seed CLASSIC_SEED (0)/undefined – kampanjen
   ("arvet") kör alltid den, så berättelsens fasta kamerapunkter
   och morfars hus stämmer.
   ============================================================ */

import { setActiveCityZones } from "./city";
import { CLASSIC_SEED, generateCityLayout } from "./cityLayout";
import { landmarksForLayout, setActiveLandmarks } from "./landmarkGen";
import { roadsForLayout, setActiveRoads } from "./roadGen";

let ACTIVE_SEED: number = CLASSIC_SEED;

/** Seed för den stad som är aktiv just nu (CLASSIC_SEED = klassiska kartan). */
export function activeCitySeed(): number {
  return ACTIVE_SEED;
}

/** Byter aktiv stad. No-op om seeden redan är aktiv (vanliga fallet:
 *  omladdning av samma parti). undefined ⇒ klassiska kartan. */
export function setActiveCityLayout(seed: number | undefined): void {
  const s = seed ?? CLASSIC_SEED;
  if (s === ACTIVE_SEED) return;
  const layout = generateCityLayout(s);
  setActiveCityZones(layout);
  const roads = roadsForLayout(layout);
  setActiveRoads(roads);
  setActiveLandmarks(landmarksForLayout(layout, roads));
  ACTIVE_SEED = s;
}
