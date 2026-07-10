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
  // w/d = fotavtryck INKL. omgivning (torg, gård, kompound), så vakten ser
  // till att inget växer in i ett distrikt. Anchorn (x,z) är renderingspunkten.
  // Omflyttade
  { id: "stadshus",    type: "stadshus",    x: 146,  z: 18,   w: 36, d: 34 }, // stadshus m. klocktorn i avenylucka C–Finans
  { id: "vattentorn",  type: "vattentorn",  x: -390, z: -345, w: 44, d: 42 }, // inhägnad kompound i NV-utkanten
  { id: "skorsten-v",  type: "skorsten",    x: 300,  z: -262, w: 26, d: 26 }, // industriplan norr om Industriområdet
  { id: "skorsten-o",  type: "skorsten",    x: 350,  z: -262, w: 26, d: 26 },
  // Nya
  { id: "stadspark",   type: "stadspark",   x: -55,  z: 158,  w: 70, d: 60 }, // stora öppna ytan söder om Centrum
  { id: "kyrka",       type: "kyrka",       x: -140, z: 120,  w: 36, d: 40 }, // kyrka + kyrkogård i luckan C–Förort
  { id: "arena",       type: "arena",       x: 95,   z: 165,  w: 78, d: 70 }, // arena + entrétorg/parkering sydost om Centrum
  { id: "pariserhjul", type: "pariserhjul", x: -235, z: 285,  w: 36, d: 14 }, // västra kajen (pir/marina går ut i vattnet)
];
