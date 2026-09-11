import { propertyBoundaries } from "../three/propertyBoundaries";
import { describe, it, expect } from "vitest";
import { generateCityLayout } from "../engine/cityLayout";
import { parcelsForLayout, zoneStreets } from "../engine/city";
import { roadsForLayout } from "../engine/roadGen";
import { landmarksForLayout } from "../engine/landmarkGen";
import { groundsPlan, overlaps } from "../three/groundsLayout";
import { publicRealmPlan, unionRects, clearStrip } from "../three/publicRealm";
import { suburbParts } from "../three/suburbParts";
import { suburbLayout } from "../three/suburbLayout";
import { financeMassing } from "../three/financeMassing";
import { villaAnnex } from "../three/villaAnnex";

describe("patch 5 public realm", () => {
  it("subtracts obstacles and unions surfaces without duplicate area", () => {
    const strips = clearStrip({ x: 0, z: 0, w: 10, d: 2 }, [{ x: 0, z: 0, w: 2, d: 4 }]);
    expect(strips.reduce((sum, r) => sum + r.w * r.d, 0)).toBe(16);
    const union = unionRects([
      { x: 0, z: 0, w: 4, d: 4 },
      { x: 2, z: 0, w: 4, d: 4 },
    ]);
    expect(union.reduce((sum, r) => sum + r.w * r.d, 0)).toBe(24);
  });
  for (const seed of [0, 7, 731])
    it(`protects districts, roads, reservations and access on map ${seed}`, () => {
      const layout = generateCityLayout(seed),
        parcels = parcelsForLayout(layout),
        roads = roadsForLayout(layout);
      const landmarks = landmarksForLayout(layout, roads);
      const plan = publicRealmPlan(
        layout,
        parcels,
        [...roads, ...zoneStreets(layout.zones)],
        landmarks,
      );
      expect(plan.sidewalks.length).toBeGreaterThan(10);
      expect(plan.meadows.length).toBeGreaterThan(10);
      expect(plan.plazas.length).toBeGreaterThan(0);
      expect(plan.crossings.length).toBeGreaterThan(0);
      for (const r of [...plan.meadows, ...plan.plazas])
        expect([...plan.solid, ...plan.sidewalks].some((b) => overlaps(r, b, 0.29))).toBe(false);
      for (const r of plan.paths) expect(plan.solid.some((b) => overlaps(r, b))).toBe(false);
      for (const r of plan.sidewalks)
        expect([...parcels, ...roads, ...plan.reserves].some((b) => overlaps(r, b))).toBe(false);
      for (const r of plan.features) expect(plan.solid.some((b) => overlaps(r, b))).toBe(false);
      expect(plan.features.filter((f) => f.kind === "tree").length).toBeLessThanOrEqual(450);
      expect(plan.plazas.length).toBeLessThanOrEqual(30);
    });
  it("keeps boundary walls clear of entrances, parking and planting", () => {
    const parcels = parcelsForLayout(generateCityLayout(0)).filter(
      (p) => p.district === "förort" || p.district === "kulle",
    );
    let count = 0;
    for (const p of parcels) {
      const plan = groundsPlan(p),
        walls = propertyBoundaries(p, plan);
      count += walls.length;
      for (const wall of walls)
        expect(
          [...plan.obstacles, ...plan.paving, ...plan.amenities, ...plan.beds].some((r) =>
            overlaps(wall, r, 0.3),
          ),
        ).toBe(false);
    }
    expect(count).toBeGreaterThan(0);
  });
  it("only lowers sidewalks for real parking and loading bays", () => {
    const layout = generateCityLayout(0),
      parcels = parcelsForLayout(layout),
      roads = [...roadsForLayout(layout), ...zoneStreets(layout.zones)];
    const props = new Map(
      parcels
        .filter((p) => groundsPlan(p).amenities.some((a) => a.kind === "parking"))
        .slice(0, 12)
        .map((p) => [p.id, "bostad" as const]),
    );
    const empty = publicRealmPlan(layout, parcels, roads, []);
    const plan = publicRealmPlan(layout, parcels, roads, [], [], new Set(), props);
    expect(empty.drives).toHaveLength(0);
    expect(plan.drives.length).toBeGreaterThan(0);
    for (const r of plan.drives) expect(roads.some((road) => overlaps(r, road))).toBe(false);
  });
  it("uses exactly the same suburb openings at every detail level", () => {
    const p = parcelsForLayout(generateCityLayout(0)).find((p) => p.district === "förort")!;
    const high = suburbParts(p, 5, 4, true, true, false, false),
      low = suburbParts(p, 5, 4, true, true, false, true);
    expect(high.find((g) => g.glass)!.items).toEqual(low.find((g) => g.glass)!.items);
    expect(suburbLayout(p, 5).houses.length).toBeGreaterThan(0);
  });
  it("keeps high-tower upper volumes within the main footprint", () => {
    const p = parcelsForLayout(generateCityLayout(0)).find((p) => p.district === "finans")!;
    for (const seed of [0, 1, 2]) {
      const volumes = financeMassing(p, 90, seed);
      expect(Math.max(...volumes.map((v) => (v.y ?? 0) + v.h))).toBe(90);
      for (const v of volumes) {
        expect(v.w).toBeLessThanOrEqual(p.w);
        expect(v.d).toBeLessThanOrEqual(p.d);
      }
    }
  });
  it("builds functional garage details at the same shared location", () => {
    const parts = villaAnnex(5.5, 6.6, "#c4b8a1");
    expect(parts.some((p) => p.y > 2.4)).toBe(true);
    expect(parts.filter((p) => p.sz < 0.1).length).toBeGreaterThan(3);
  });
});
