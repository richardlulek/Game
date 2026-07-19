/* ============================================================
   Vägnätets data – rena världskoordinater, inga three-beroenden.
   Klassiska lederna och generatorn för slumpade layouter bor i
   engine/roadGen.ts; den här modulen är kvar som stabil importväg
   för 3D-vyn (Roads.tsx) och vägnätstesterna. ROADS är alltid det
   nät spelet kör – tills vidare den klassiska kartans leder.
   ============================================================ */

import { ACTIVE_ROADS, type RoadSeg } from "../engine/roadGen";

export type { RoadSeg };

/** Huvudlederna mellan distrikten (den aktiva stadens nät). */
export const ROADS: RoadSeg[] = ACTIVE_ROADS;
