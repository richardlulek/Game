/* ============================================================
   Landmärken – rena ankarpositioner (världskoordinater) utan
   three-beroenden. Klassiska listan och placeraren för slumpade
   layouter bor i engine/landmarkGen.ts; den här modulen är kvar
   som stabil importväg för 3D-vyn (CityExtras) och testerna.
   LANDMARKS är alltid det som renderas – tills vidare klassiska
   kartans landmärken.
   ============================================================ */

import { CLASSIC_LANDMARKS, type LandmarkAnchor, type LandmarkType } from "../engine/landmarkGen";

export type { LandmarkAnchor, LandmarkType };

/** Stadens landmärken (klassiska kartan). */
export const LANDMARKS: LandmarkAnchor[] = CLASSIC_LANDMARKS;
