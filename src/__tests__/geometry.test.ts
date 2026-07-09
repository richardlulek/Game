import { describe, expect, it } from "vitest";
import { DISTRICT_ZONES, ZONE_DEFS, PARCELS } from "../engine/city";

// Geometrivakt: skyddar mot att distriktszoner/expansionskvarter börjar krocka,
// hamnar i vattnet, ovanpå HK eller utanför kartan när layouten ändras.
type Box = { name: string; x0: number; x1: number; z0: number; z1: number };

const CITY = { x0: -490, x1: 530, z0: -405, z1: 350 };
const WATER_Z0 = 300; // vatten börjar ungefär här (söderut)
const HQ = { x: -225, z: 215, r: 30 };

function overlap(a: Box, b: Box, margin = 6): boolean {
  return a.x0 < b.x1 - margin && a.x1 > b.x0 + margin && a.z0 < b.z1 - margin && a.z1 > b.z0 + margin;
}

describe("GEO: områden krockar inte, ligger inom kartan och undviker vatten", () => {
  it("validerar zon- och tomtgeometrin", () => {
    const zoneBoxes: Box[] = DISTRICT_ZONES.map((z) => ({
      name: z.district, x0: z.x - z.w / 2, x1: z.x + z.w / 2, z0: z.z - z.d / 2, z1: z.z + z.d / 2,
    }));

    // Inga zoner överlappar varandra.
    for (let i = 0; i < zoneBoxes.length; i++)
      for (let j = i + 1; j < zoneBoxes.length; j++)
        expect(overlap(zoneBoxes[i], zoneBoxes[j]), `${zoneBoxes[i].name} ∩ ${zoneBoxes[j].name}`).toBe(false);

    // Expansionskvarterens bboxar (ur expansionstomterna) får inte överlappa zoner.
    const expByBlock = new Map<string, Box>();
    for (const p of PARCELS) {
      if (!p.expansion) continue;
      const b = expByBlock.get(p.blockId) ?? { name: p.blockId, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      b.x0 = Math.min(b.x0, p.x - p.w / 2); b.x1 = Math.max(b.x1, p.x + p.w / 2);
      b.z0 = Math.min(b.z0, p.z - p.d / 2); b.z1 = Math.max(b.z1, p.z + p.d / 2);
      expByBlock.set(p.blockId, b);
    }
    for (const eb of expByBlock.values())
      for (const zb of zoneBoxes)
        expect(overlap(eb, zb), `expansion ${eb.name} ∩ zon ${zb.name}`).toBe(false);

    // Alla tomter inom kartan, ej i vattnet, ej ovanpå HK.
    for (const p of PARCELS) {
      expect(p.x).toBeGreaterThan(CITY.x0);
      expect(p.x).toBeLessThan(CITY.x1);
      expect(p.z).toBeGreaterThan(CITY.z0);
      expect(p.z).toBeLessThan(CITY.z1);
      expect(p.z + p.d / 2, `tomt ${p.id} i vattnet`).toBeLessThan(WATER_Z0);
      expect(Math.hypot(p.x - HQ.x, p.z - HQ.z), `tomt ${p.id} ovanpå HK`).toBeGreaterThan(HQ.r);
    }

    // Sju distrikt och ett rejält bestånd tomtrutor.
    expect(ZONE_DEFS.length).toBe(7);
    expect(PARCELS.length).toBeGreaterThanOrEqual(250);
  });
});
