import { describe, expect, it } from "vitest";
import { parcelsForLayout, ZONE_DEFS } from "../engine/city";
import {
  CLASSIC_EXPANSIONS,
  CLASSIC_SEED,
  CLASSIC_ZONES,
  COAST_Z,
  generateCityLayout,
  HQ_RESERVE,
  MAP_BOUNDS,
  zoneFootprint,
  type CityLayout,
} from "../engine/cityLayout";

/* Layoutgeneratorns kravspec: samma invarianter som geometry.test.ts vaktar
   för den klassiska kartan, men körda över många seeds. Håller de här håller
   varje slumpad stad – utan att någon behöver ögna igenom dem. */

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

type Box = { name: string; x0: number; x1: number; z0: number; z1: number };

function zoneBoxes(layout: CityLayout): Box[] {
  return layout.zones.map((z) => {
    const s = zoneFootprint(z);
    return { name: z.district, x0: z.cx - s.w / 2, x1: z.cx + s.w / 2, z0: z.cz - s.d / 2, z1: z.cz + s.d / 2 };
  });
}

function expansionBoxes(layout: CityLayout): Box[] {
  return layout.expansions.map((e) => {
    const w = e.parcelCols * e.parcelW;
    const d = e.parcelRows * e.parcelD;
    return { name: e.blockId, x0: e.cx - w / 2, x1: e.cx + w / 2, z0: e.cz - d / 2, z1: e.cz + d / 2 };
  });
}

// Samma överlappsmått som geometry.test.ts: upp till `margin` intrång tolereras.
function overlap(a: Box, b: Box, margin = 6): boolean {
  return a.x0 < b.x1 - margin && a.x1 > b.x0 + margin && a.z0 < b.z1 - margin && a.z1 > b.z0 + margin;
}

const classicCounts = (() => {
  const counts = new Map<string, number>();
  for (const p of parcelsForLayout(generateCityLayout(CLASSIC_SEED)))
    counts.set(p.district, (counts.get(p.district) ?? 0) + 1);
  return counts;
})();

describe("STADSLAYOUT: seedad generator håller geometrivakternas invarianter", () => {
  it("ger EXAKT klassiska kartan för CLASSIC_SEED", () => {
    const layout = generateCityLayout(CLASSIC_SEED);
    expect(layout.zones).toEqual(CLASSIC_ZONES);
    expect(layout.expansions).toEqual(CLASSIC_EXPANSIONS);
    // city.ts kör samma data – ZONE_DEFS är den klassiska layouten.
    expect(ZONE_DEFS).toEqual(CLASSIC_ZONES);
  });

  it("är deterministisk: samma seed ⇒ samma layout", () => {
    for (const seed of [1, 7, 123, 9999]) {
      expect(generateCityLayout(seed)).toEqual(generateCityLayout(seed));
    }
  });

  it("varierar faktiskt: olika seeds flyttar och formar om distrikten", () => {
    const centers = new Set(
      SEEDS.slice(0, 50).map((s) => {
        const c = generateCityLayout(s).zones.find((z) => z.district === "centrum")!;
        return `${c.cx},${c.cz},${c.blockCols}x${c.blockRows}`;
      }),
    );
    // Minst 40 av 50 seeds ska ge unika centrum-lägen/former.
    expect(centers.size).toBeGreaterThanOrEqual(40);
    // Och åtminstone någon seed ska välja en annan rutnätsform än 4×4.
    const shapes = new Set(
      SEEDS.slice(0, 50).map((s) => {
        const c = generateCityLayout(s).zones.find((z) => z.district === "centrum")!;
        return `${c.blockCols}x${c.blockRows}`;
      }),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("håller alla invarianter över 400 seeds", { timeout: 60_000 }, () => {
    // Överträdelser samlas som strängar och jämförs EN gång på slutet –
    // miljontals expect-anrop i loopen gör annars testet flera gånger
    // långsammare än själva genereringen.
    const violations: string[] = [];
    const check = (ok: boolean, msg: string) => {
      if (!ok) violations.push(msg);
    };

    for (const seed of SEEDS) {
      const layout = generateCityLayout(seed);

      // Sju distrikt med bevarade identiteter, i klassisk ordning.
      check(
        layout.zones.map((z) => z.district).join() === CLASSIC_ZONES.map((z) => z.district).join(),
        `seed ${seed}: distriktsordningen ändrad`,
      );
      check(
        layout.expansions.map((e) => e.blockId).join() === CLASSIC_EXPANSIONS.map((e) => e.blockId).join(),
        `seed ${seed}: expansionskvarter saknas/omordnade`,
      );

      const zones = zoneBoxes(layout);
      const exps = expansionBoxes(layout);

      // Inga zoner överlappar varandra; expansioner fria från zoner och varandra.
      for (let i = 0; i < zones.length; i++)
        for (let j = i + 1; j < zones.length; j++)
          check(!overlap(zones[i], zones[j]), `seed ${seed}: ${zones[i].name} ∩ ${zones[j].name}`);
      for (const eb of exps) {
        for (const zb of zones) check(!overlap(eb, zb), `seed ${seed}: ${eb.name} ∩ ${zb.name}`);
        for (const other of exps)
          if (other !== eb) check(!overlap(eb, other), `seed ${seed}: ${eb.name} ∩ ${other.name}`);
      }

      // Kajremsan ligger vid kusten (södra kanten strax innanför vattnet).
      const hamnen = zones.find((z) => z.name === "hamnen")!;
      check(hamnen.z1 > COAST_Z - 25, `seed ${seed}: hamnen har tappat kusten`);
      check(hamnen.z1 < COAST_Z - 3, `seed ${seed}: hamnen i vattnet`);

      // Väderstrecksidentiteterna består: Villakullen nordväst, Finans öster osv.
      const c = (d: string) => layout.zones.find((z) => z.district === d)!;
      check(c("kulle").cx < -240, `seed ${seed}: kulle ej väst`);
      check(c("kulle").cz < -140, `seed ${seed}: kulle ej norr`);
      check(c("finans").cx > 200, `seed ${seed}: finans ej öst`);
      check(c("industri").cx > 240, `seed ${seed}: industri ej öst`);
      check(c("industri").cz < -60, `seed ${seed}: industri ej norr`);
      check(c("förort").cx < -220, `seed ${seed}: förort ej väst`);
      check(c("innerstad").cz < -100, `seed ${seed}: innerstad ej norr`);

      // Alla tomter inom kartan, ej i vattnet, ej ovanpå HK – och antalet
      // tomter per distrikt inom ±10 % av klassiska kartan (scenariobalans).
      const parcels = parcelsForLayout(layout);
      const counts = new Map<string, number>();
      for (const p of parcels) {
        counts.set(p.district, (counts.get(p.district) ?? 0) + 1);
        check(
          p.x > MAP_BOUNDS.x0 && p.x < MAP_BOUNDS.x1 && p.z > MAP_BOUNDS.z0 && p.z < MAP_BOUNDS.z1,
          `seed ${seed}: tomt ${p.id} utanför kartan`,
        );
        check(p.z + p.d / 2 < COAST_Z, `seed ${seed}: tomt ${p.id} i vattnet`);
        check(
          Math.hypot(p.x - HQ_RESERVE.x, p.z - HQ_RESERVE.z) > HQ_RESERVE.r,
          `seed ${seed}: tomt ${p.id} ovanpå HK`,
        );
      }
      for (const [district, classic] of classicCounts) {
        const n = counts.get(district) ?? 0;
        check(
          n >= Math.floor(classic * 0.9) && n <= Math.ceil(classic * 1.1),
          `seed ${seed}: ${district} har ${n} tomter (klassiskt ${classic})`,
        );
      }
    }
    expect(violations.slice(0, 20)).toEqual([]);
  });
});
