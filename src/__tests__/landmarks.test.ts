import { describe, expect, it } from "vitest";
import { DISTRICT_ZONES } from "../engine/city";
import { LANDMARKS } from "../three/landmarks";

/* Landmärkesvakt: sevärdheterna ska stå i stadens öppna ytor och kanter –
   aldrig mitt i ett distrikt, i vattnet eller ovanpå HK. Bakgrund: efter en
   omskalning av kartan hamnade klocktornet och skorstenarna inuti Industri-
   området och vattentornet inuti Villakullen. */

type Box = { x0: number; x1: number; z0: number; z1: number };

const CITY = { x0: -490, x1: 530, z0: -405, z1: 350 };
const WATER_Z0 = 300;
const HQ = { x: -225, z: 215, r: 30 };

const districtBox = (d: (typeof DISTRICT_ZONES)[number]): Box => ({
  x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2,
});
const landmarkBox = (l: (typeof LANDMARKS)[number]): Box => ({
  x0: l.x - l.w / 2, x1: l.x + l.w / 2, z0: l.z - l.d / 2, z1: l.z + l.d / 2,
});
const intersects = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

describe("LANDMÄRKEN: står i öppna ytor, inte i distrikt/vatten/HK", () => {
  const dBoxes = DISTRICT_ZONES.map((d) => ({ name: d.district, box: districtBox(d) }));

  it("placerar inget landmärke inuti ett distrikt", () => {
    for (const l of LANDMARKS) {
      const b = landmarkBox(l);
      for (const d of dBoxes)
        expect(intersects(b, d.box), `${l.id} står i ${d.name}`).toBe(false);
    }
  });

  it("håller varje landmärke inom kartan, utanför vattnet och fritt från HK", () => {
    for (const l of LANDMARKS) {
      const b = landmarkBox(l);
      expect(b.x0, `${l.id} utanför kartan (väst)`).toBeGreaterThan(CITY.x0);
      expect(b.x1, `${l.id} utanför kartan (öst)`).toBeLessThan(CITY.x1);
      expect(b.z0, `${l.id} utanför kartan (norr)`).toBeGreaterThan(CITY.z0);
      expect(b.z1, `${l.id} i vattnet`).toBeLessThan(WATER_Z0);
      const nx = Math.max(b.x0, Math.min(HQ.x, b.x1));
      const nz = Math.max(b.z0, Math.min(HQ.z, b.z1));
      expect(Math.hypot(nx - HQ.x, nz - HQ.z), `${l.id} står på HK`).toBeGreaterThan(HQ.r);
    }
  });

  it("har unika id:n", () => {
    const ids = LANDMARKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
