/* ============================================================
   Vägnätets data – rena världskoordinater, inga three-beroenden.
   Ligger separat från Roads.tsx så att både 3D-vyn och testerna
   kan läsa nätet. Huvudlederna binder ihop de sju distrikten;
   varje led överlappar de två distrikt den kopplar (avstämt mot
   zonerna i engine/city.ts). Roads.test.ts vaktar att alla sju
   distrikt når varandra och att ingen led hamnar i vattnet/på HK.
   ============================================================ */

/** En körbana som en axelriktad rektangel (centrum x/z, bredd/djup). */
export interface RoadSeg {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Huvudlederna mellan distrikten. Varje led sträcker sig en bit in i de
 * båda distrikt den binder ihop, så nätet blir sammanhängande. De två
 * kajlederna kopplar Förorten → Hamnen genom att mötas i sydväst (förbi HK).
 */
export const ROADS: RoadSeg[] = [
  // Nord–sydliga stråket genom Centrum
  { x: 0, z: -88, w: 14, d: 44 },     // Centrum ↑ Innerstaden
  { x: 10, z: 163, w: 16, d: 150 },   // Esplanaden: Centrum ↓ Hamnen
  // Österut mot Finans och Industriområdet
  { x: 126, z: 68, w: 44, d: 12 },    // Avenyn: Centrum → Finans
  { x: 255, z: -12, w: 14, d: 126 },  // Finans ↑ Industriområdet
  { x: 214, z: 215, w: 12, d: 44 },   // Finans ↓ Hamnen
  // Västerut mot Förorten och Villakullen
  { x: -141, z: 30, w: 56, d: 12 },   // Centrum ← Förorten
  { x: -182, z: -190, w: 54, d: 12 }, // Innerstaden ← Villakullen
  { x: -310, z: -81, w: 12, d: 62 },  // Villakullen ↓ Förorten
  // Sydvästra kajstråket (förbi HK ned till kajen)
  { x: -290, z: 209, w: 12, d: 98 },  // Förorten ↓ kajen
  { x: -233, z: 262, w: 126, d: 12 }, // Västra kajvägen → Hamnen
];
