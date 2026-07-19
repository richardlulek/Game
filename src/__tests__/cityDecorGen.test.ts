import { describe, expect, it } from "vitest";
import { districtZonesFor, parcelsForLayout, zoneStreets } from "../engine/city";
import {
  CLASSIC_SEED,
  COAST_Z,
  generateCityLayout,
  HQ_RESERVE,
  MAP_BOUNDS,
} from "../engine/cityLayout";
import { CLASSIC_LANDMARKS, landmarksForLayout } from "../engine/landmarkGen";
import { CLASSIC_ROADS, roadsForLayout } from "../engine/roadGen";

/* Etapp 2-vakt: väg- och landmärkesgeneratorerna körs mot samma invarianter
   som roads.test.ts och landmarks.test.ts vaktar för klassiska kartan –
   men över många seedade layouter. */

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

type Box = { x0: number; x1: number; z0: number; z1: number };

const box = (x: number, z: number, w: number, d: number): Box => ({
  x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2,
});
const intersects = (a: Box, b: Box, m = 0): boolean =>
  a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;

describe("VÄG/LANDMÄRKESGENERATOR: håller vakternas invarianter över seeds", () => {
  it("ger EXAKT klassiska nätet och landmärkena för CLASSIC_SEED", () => {
    const layout = generateCityLayout(CLASSIC_SEED);
    expect(roadsForLayout(layout)).toEqual(CLASSIC_ROADS);
    expect(landmarksForLayout(layout, CLASSIC_ROADS)).toEqual(CLASSIC_LANDMARKS);
  });

  it("är deterministisk: samma layout ⇒ samma vägar och landmärken", () => {
    for (const seed of [3, 77, 1234]) {
      const layout = generateCityLayout(seed);
      const roads = roadsForLayout(layout);
      expect(roads).toEqual(roadsForLayout(layout));
      expect(landmarksForLayout(layout, roads)).toEqual(landmarksForLayout(layout, roads));
    }
  });

  it("håller alla invarianter över 200 seeds", { timeout: 120_000 }, () => {
    const violations: string[] = [];
    const check = (ok: boolean, msg: string) => {
      if (!ok) violations.push(msg);
    };

    for (const seed of SEEDS) {
      const layout = generateCityLayout(seed);
      const roads = roadsForLayout(layout);
      const landmarks = landmarksForLayout(layout, roads);

      const dBoxes = districtZonesFor(layout.zones).map((d) => ({
        name: d.district,
        box: box(d.x, d.z, d.w, d.d),
      }));
      const rBoxes = roads.map((r, i) => ({ name: `väg${i}`, box: box(r.x, r.z, r.w, r.d) }));
      const streets = zoneStreets(layout.zones);
      const expBoxes = layout.expansions.map((e) => ({
        name: e.blockId,
        box: box(e.cx, e.cz, e.parcelCols * e.parcelW, e.parcelRows * e.parcelD),
      }));

      /* ── Vägnätet (roads.test.ts-invarianterna) ── */
      for (const [i, r] of rBoxes.entries()) {
        check(r.box.x0 > MAP_BOUNDS.x0 && r.box.x1 < MAP_BOUNDS.x1 && r.box.z0 > MAP_BOUNDS.z0,
          `seed ${seed}: väg${i} utanför kartan`);
        check(r.box.z1 < COAST_Z, `seed ${seed}: väg${i} i vattnet`);
        const nx = Math.max(r.box.x0, Math.min(HQ_RESERVE.x, r.box.x1));
        const nz = Math.max(r.box.z0, Math.min(HQ_RESERVE.z, r.box.z1));
        check(Math.hypot(nx - HQ_RESERVE.x, nz - HQ_RESERVE.z) > HQ_RESERVE.r,
          `seed ${seed}: väg${i} korsar HK`);
        // Ingen svävande led.
        const touches =
          dBoxes.some((d) => intersects(r.box, d.box, 2)) ||
          rBoxes.some((o, j) => j !== i && intersects(r.box, o.box, 2));
        check(touches, `seed ${seed}: väg${i} svävar fritt`);
        // Ingen led genom expansionsmark.
        for (const eb of expBoxes)
          check(!intersects(r.box, eb.box, 1), `seed ${seed}: väg${i} korsar ${eb.name}`);
        // Gatunätsanslutning i varje distrikt leden går in i.
        for (const d of dBoxes) {
          if (!intersects(r.box, d.box, 2)) continue;
          const hit = streets
            .filter((s) => s.district === d.name)
            .some((s) => intersects(r.box, box(s.x, s.z, s.w, s.d)));
          check(hit, `seed ${seed}: väg${i} möter ingen kvartersgata i ${d.name}`);
        }
      }
      // Alla sju distrikt nåbara från Centrum.
      const nodes = [
        ...dBoxes.map((d) => ({ ...d, kind: "D" as const })),
        ...rBoxes.map((r) => ({ ...r, kind: "R" as const })),
      ];
      const adj = new Map<string, Set<string>>(nodes.map((n) => [n.name, new Set<string>()]));
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[i].kind === "D" && nodes[j].kind === "D") continue;
          if (intersects(nodes[i].box, nodes[j].box, 2)) {
            adj.get(nodes[i].name)!.add(nodes[j].name);
            adj.get(nodes[j].name)!.add(nodes[i].name);
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
        check(seen.has(d.name), `seed ${seed}: ${d.name} oåtkomligt från Centrum`);

      /* ── Landmärkena (landmarks.test.ts-invarianterna + krockfrihet) ── */
      check(landmarks.length === CLASSIC_LANDMARKS.length,
        `seed ${seed}: landmärken saknas (${landmarks.length}/${CLASSIC_LANDMARKS.length})`);
      check(new Set(landmarks.map((l) => l.id)).size === landmarks.length,
        `seed ${seed}: dubblerade landmärkes-id`);
      for (const l of landmarks) {
        const b = box(l.x, l.z, l.w, l.d);
        for (const d of dBoxes)
          check(!intersects(b, d.box), `seed ${seed}: ${l.id} står i ${d.name}`);
        check(b.x0 > MAP_BOUNDS.x0 && b.x1 < MAP_BOUNDS.x1 && b.z0 > MAP_BOUNDS.z0,
          `seed ${seed}: ${l.id} utanför kartan`);
        check(b.z1 < COAST_Z, `seed ${seed}: ${l.id} i vattnet`);
        const nx = Math.max(b.x0, Math.min(HQ_RESERVE.x, b.x1));
        const nz = Math.max(b.z0, Math.min(HQ_RESERVE.z, b.z1));
        check(Math.hypot(nx - HQ_RESERVE.x, nz - HQ_RESERVE.z) > HQ_RESERVE.r,
          `seed ${seed}: ${l.id} står på HK`);
        // Krockfritt mot vägar, expansionsmark och andra landmärken.
        for (const r of rBoxes) check(!intersects(b, r.box), `seed ${seed}: ${l.id} på ${r.name}`);
        for (const eb of expBoxes) check(!intersects(b, eb.box), `seed ${seed}: ${l.id} på ${eb.name}`);
        for (const o of landmarks)
          if (o !== l) check(!intersects(b, box(o.x, o.z, o.w, o.d)), `seed ${seed}: ${l.id} ∩ ${o.id}`);
      }
      // Tomterna får inte hamna under en huvudled. Marginal 7: en led som
      // följer en kvartersgata naggar kanttomterna med upp till ~6 enheter
      // (leden är bredare än gatan – klassiska nätet gör likadant), medan en
      // led som plöjer GENOM ett kvarter tränger in en hel tomtbredd (~17).
      const parcels = parcelsForLayout(layout);
      for (const r of rBoxes)
        for (const p of parcels)
          check(!intersects(r.box, box(p.x, p.z, p.w, p.d), 7),
            `seed ${seed}: ${r.name} kör över tomt ${p.id}`);
    }
    expect(violations.slice(0, 20)).toEqual([]);
  });
});
