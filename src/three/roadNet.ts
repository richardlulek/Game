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
// Varje led ligger i linje med en riktig kvartersgata i BÅDA distrikt den
// binder ihop (avstämt mot zoneStreets i engine/city.ts), så trafiken flyter
// in i gatunätet i stället för att köra in i en husfasad. roads.test.ts
// vaktar både anslutningen till gatunätet och att nätet hänger ihop.
export const ROADS: RoadSeg[] = [
  // Nord–sydliga stråken genom Centrum
  { x: 60, z: -88, w: 14, d: 44 },    // Centrum ↑ Innerstaden (gata x63/x58)
  { x: 2, z: 163, w: 16, d: 150 },    // Esplanaden: Centrum ↓ Hamnen (gata x0/x4)
  // Österut mot Finans och Industriområdet
  { x: 146, z: 60, w: 70, d: 12 },    // Avenyn: Centrum → Finans (gata z56/z64)
  { x: 195, z: -12, w: 14, d: 126 },  // Finans ↑ Industri (gata x196/x194, väster om kommunal mark)
  { x: 196, z: 215, w: 12, d: 44 },   // Finans ↓ Hamnen (delad gata x196)
  // Västerut mot Förorten och Villakullen
  { x: -141, z: 9, w: 56, d: 12 },    // Centrum ← Förorten (gata z10/z7)
  { x: -182, z: -229, w: 54, d: 12 }, // Innerstaden ← Villakullen (gata z-230/z-228)
  { x: -250, z: -81, w: 12, d: 62 },  // Villakullen ↓ Förorten (delad gata x-250)
  // Sydvästra kajstråket (förbi HK ned till kajen)
  { x: -280, z: 214, w: 12, d: 128 }, // Förorten ↓ kajen (gata x-280)
  { x: -233, z: 274, w: 126, d: 12 }, // Västra kajvägen → Hamnen (gata z274)
];
