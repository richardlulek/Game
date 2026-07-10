import { describe, expect, it } from "vitest";
import { DISTRICT_ZONES, PARCELS, ZONE_STREETS } from "../engine/city";
import { ROADS } from "../three/roadNet";

/* Vägnätsvakt: huvudlederna binder ihop distrikten. När stadslayouten
   skalas om får nätet inte tappa kopplingar, hamna i vattnet eller korsa HK.
   Bakgrund: tidigare drev de handtunade vägarna isär från zonerna vid en
   omskalning så att sex av sju distrikt blev oåtkomliga. */

type Box = { x0: number; x1: number; z0: number; z1: number };

const CITY = { x0: -490, x1: 530, z0: -405, z1: 350 };
const WATER_Z0 = 300;
const HQ = { x: -225, z: 215, r: 30 };

const districtBox = (d: (typeof DISTRICT_ZONES)[number]): Box => ({
  x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2,
});
const roadBox = (r: (typeof ROADS)[number]): Box => ({
  x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2,
});
const intersects = (a: Box, b: Box, m = 0): boolean =>
  a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;

describe("VÄGNÄT: alla distrikt kopplade, ingen led i vatten eller på HK", () => {
  const dBoxes = DISTRICT_ZONES.map((d) => ({ name: d.district, box: districtBox(d) }));
  const rBoxes = ROADS.map((r, i) => ({ name: `väg${i}`, box: roadBox(r) }));

  it("håller alla leder inom kartan, utanför vattnet och fria från HK", () => {
    for (const [i, r] of rBoxes.entries()) {
      expect(r.box.x0, `väg${i} utanför kartan (väst)`).toBeGreaterThan(CITY.x0);
      expect(r.box.x1, `väg${i} utanför kartan (öst)`).toBeLessThan(CITY.x1);
      expect(r.box.z0, `väg${i} utanför kartan (norr)`).toBeGreaterThan(CITY.z0);
      expect(r.box.z1, `väg${i} i vattnet`).toBeLessThan(WATER_Z0);
      // Närmaste punkt på vägrektangeln till HK ska ligga utanför HK-radien.
      const nx = Math.max(r.box.x0, Math.min(HQ.x, r.box.x1));
      const nz = Math.max(r.box.z0, Math.min(HQ.z, r.box.z1));
      expect(Math.hypot(nx - HQ.x, nz - HQ.z), `väg${i} korsar HK`).toBeGreaterThan(HQ.r);
    }
  });

  it("låter ingen led sväva fritt – varje väg möter minst ett distrikt eller en annan väg", () => {
    for (const [i, r] of rBoxes.entries()) {
      const touchesDistrict = dBoxes.some((d) => intersects(r.box, d.box, 2));
      const touchesRoad = rBoxes.some((o, j) => j !== i && intersects(r.box, o.box, 2));
      expect(touchesDistrict || touchesRoad, `väg${i} svävar fritt`).toBe(true);
    }
  });

  it("drar ingen led genom expansionsmark (kommunal eller planmark)", () => {
    // Expansionskvarterens bboxar härleds ur expansionstomterna (som geometry.test).
    const expByBlock = new Map<string, Box>();
    for (const p of PARCELS) {
      if (!p.expansion) continue;
      const b = expByBlock.get(p.blockId) ??
        { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      b.x0 = Math.min(b.x0, p.x - p.w / 2); b.x1 = Math.max(b.x1, p.x + p.w / 2);
      b.z0 = Math.min(b.z0, p.z - p.d / 2); b.z1 = Math.max(b.z1, p.z + p.d / 2);
      expByBlock.set(p.blockId, b);
    }
    for (const [i, r] of rBoxes.entries())
      for (const [name, eb] of expByBlock)
        expect(intersects(r.box, eb, 1), `väg${i} korsar expansionsmark ${name}`).toBe(false);
  });

  it("ansluter till gatunätet: varje led möter en kvartersgata i de distrikt den går in i", () => {
    // För varje huvudled: i varje distrikt den tränger in i ska minst en av
    // distriktets kvartersgator (ZONE_STREETS) fysiskt överlappa leden – annars
    // kör leden in i en husfasad i stället för in i gatunätet.
    for (const [i, r] of rBoxes.entries()) {
      for (const d of dBoxes) {
        if (!intersects(r.box, d.box, 2)) continue; // leden går inte in här
        const streetHit = ZONE_STREETS.filter((s) => s.district === d.name).some((s) =>
          intersects(r.box, { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 }),
        );
        expect(streetHit, `väg${i} möter ingen kvartersgata i ${d.name}`).toBe(true);
      }
    }
  });

  it("når alla sju distrikt från Centrum genom vägnätet", () => {
    // Graf: distrikt- och vägnoder. Kant = två boxar överlappar (dock inte
    // distrikt↔distrikt, som ju gränsar utan väg).
    const nodes = [
      ...dBoxes.map((d) => ({ ...d, kind: "D" as const })),
      ...rBoxes.map((r) => ({ ...r, kind: "R" as const })),
    ];
    const adj = new Map<string, Set<string>>(nodes.map((n) => [n.name, new Set<string>()]));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].kind === "D" && nodes[j].kind === "D") continue;
        if (intersects(nodes[i].box, nodes[j].box, 2)) {
          adj.get(nodes[i].name)!.add(nodes[j].name);
          adj.get(nodes[j].name)!.add(nodes[i].name);
        }
      }
    }
    const seen = new Set<string>();
    const stack = ["centrum"];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of adj.get(n) ?? []) stack.push(m);
    }
    for (const d of dBoxes)
      expect(seen.has(d.name), `${d.name} oåtkomligt från Centrum`).toBe(true);
  });
});
