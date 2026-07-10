/* ============================================================
   Landmärken – rena ankarpositioner (världskoordinater) utan
   three-beroenden, så både 3D-vyn (CityExtras) och testerna kan
   läsa dem. w/d är ett ungefärligt fotavtryck som placerings-
   vakten (landmarks.test.ts) använder för att se till att inget
   landmärke hamnar mitt i ett distrikt, i vattnet eller på HK.
   ============================================================ */

export type LandmarkType =
  | "stadshus"
  | "vattentorn"
  | "skorsten"
  | "stadspark"
  | "kyrka"
  | "arena"
  | "pariserhjul";

export interface LandmarkAnchor {
  id: string;
  type: LandmarkType;
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Placerade i stadens öppna ytor och kanter – aldrig inuti ett distrikt.
 * De tre första fanns förut men stod (efter omskalningen) mitt i Industri-
 * och Villakulle-kvarteren; de är nu omflyttade. Resten är nya för mer liv.
 */
export const LANDMARKS: LandmarkAnchor[] = [
  // Omflyttade
  { id: "stadshus",    type: "stadshus",    x: 146,  z: 18,   w: 18, d: 18 }, // civic torn i avenylucka C–Finans
  { id: "vattentorn",  type: "vattentorn",  x: -330, z: -345, w: 14, d: 14 }, // norr om Villakullen (öppen mark)
  { id: "skorsten-v",  type: "skorsten",    x: 300,  z: -262, w: 6,  d: 6 },  // norr om Industriområdet
  { id: "skorsten-o",  type: "skorsten",    x: 350,  z: -262, w: 6,  d: 6 },
  // Nya
  { id: "stadspark",   type: "stadspark",   x: -55,  z: 158,  w: 70, d: 60 }, // stora öppna ytan söder om Centrum
  { id: "kyrka",       type: "kyrka",       x: -140, z: 120,  w: 22, d: 30 }, // luckan mellan Centrum och Förorten
  { id: "arena",       type: "arena",       x: 95,   z: 165,  w: 52, d: 38 }, // öppna ytan sydost om Centrum
  { id: "pariserhjul", type: "pariserhjul", x: -235, z: 285,  w: 36, d: 14 }, // västra kajen, väster om Hamnen
];
