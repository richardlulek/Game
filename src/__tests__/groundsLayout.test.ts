import { describe, expect, it } from "vitest";
import { PARCELS, parcelsForLayout, type Parcel } from "../engine/city";
import { generateCityLayout } from "../engine/cityLayout";
import { groundObstacles, groundsPlan, insidePlot, overlaps, pathRect, routeToStreet, walkingPath, sampleWalker } from "../three/groundsLayout";
import { suburbFloors, suburbLayout } from "../three/suburbLayout";

const plot: Parcel = { id: "test-yard", x: 0, z: 0, w: 20, d: 20, district: "kulle", blockId: "test", edges: { n: false, e: false, s: true, w: false } };
const districts = ["centrum", "innerstad", "finans", "hamnen", "industri", "förort", "kulle"];

function verifyPlan(p: Parcel) {
  const plan = groundsPlan(p);
  for (const r of [...plan.paving, ...plan.beds]) {
    expect(insidePlot(r, p)).toBe(true);
    expect(plan.obstacles.some(o => overlaps(r, o))).toBe(false);
  }
  for (const b of plan.beds) expect(plan.paving.some(r => overlaps(b, r, 0.2))).toBe(false);
  for (let i = 1; i < plan.route.length; i++) {
    const a = plan.route[i - 1], b = plan.route[i];
    expect(a.x === b.x || a.z === b.z).toBe(true);
  }
  if (plan.route.length) {
    const end = plan.route[plan.route.length - 1];
    const gate = (p.edges.n && Math.abs(end.z + p.d / 2 - 0.4) < 0.001) ||
      (p.edges.s && Math.abs(end.z - p.d / 2 + 0.4) < 0.001) ||
      (p.edges.e && Math.abs(end.x - p.w / 2 + 0.4) < 0.001) ||
      (p.edges.w && Math.abs(end.x + p.w / 2 - 0.4) < 0.001);
    expect(gate).toBe(true);
  }
  expect(plan.beds.length).toBeLessThanOrEqual(6);
  return plan;
}

describe("property grounds", () => {
  it("uses long apartment blocks rather than narrow towers on small plots", () => {
    for (const seed of [0, 1, 2, 3, 17]) {
      const p = { ...plot, district: "förort", w: 22, d: 24 };
      const layout = suburbLayout(p, seed);
      expect(layout.houses).toHaveLength(2);
      for (const h of layout.houses) { expect(h.w / h.d).toBeGreaterThan(2); expect(insidePlot(h, p)).toBe(true); }
    }
  });
  it("keeps larger suburban blocks separated and within their parcels", () => {
    for (const w of [22, 32, 48, 60]) {
      const p = { ...plot, district: "förort", w, d: 30 }, layout = suburbLayout(p);
      expect(layout.houses.length).toBeLessThanOrEqual(4);
      layout.houses.forEach((h, i) => {
        expect(insidePlot(h, p)).toBe(true);
        for (const other of layout.houses.slice(i + 1)) expect(overlaps(h, other, 0.5)).toBe(false);
      });
    }
  });
  it("uses coherent three-to-five-storey apartment blocks with at most one floor difference", () => {
    for (const floors of [1, 3, 4, 8]) for (const seed of [0, 1, 17, 22]) {
      const a = suburbFloors(floors, seed, 0), b = suburbFloors(floors, seed, 1);
      expect(a).toBeGreaterThanOrEqual(3); expect(a).toBeLessThanOrEqual(5);
      expect(b).toBeGreaterThanOrEqual(3); expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    }
  });
  it("walks in and out along the path with a hidden pause at the entrance", () => {
    const path = walkingPath([{ x: 0, z: 0 }, { x: 0, z: 4 }, { x: 3, z: 4 }]);
    const point = { x: 0, z: 0, heading: 0, visible: false };
    sampleWalker(path, 0, point); expect(point).toMatchObject({ x: 3, z: 4, visible: true });
    sampleWalker(path, 0.5, point); expect(point).toMatchObject({ x: 0, z: 0, visible: false });
    sampleWalker(path, 0.8, point); expect(point.x).toBe(0); expect(point.z).toBeCloseTo(3.5);
    sampleWalker(path, 1, point); expect(point).toMatchObject({ x: 3, z: 4, visible: true });
    sampleWalker(walkingPath([]), 0.2, point); expect(point.visible).toBe(false);
  });
  it("finds an unobstructed connection to a real street edge", () => {
    const route = routeToStreet(plot, { x: 0, z: 1 }, []);
    expect(route).toEqual([{ x: 0, z: 1 }, { x: 0, z: 9.6 }]);
  });
  it("routes around a building using the full walkway width", () => {
    const block = { x: 0, z: 5, w: 5, d: 3 };
    const route = routeToStreet(plot, { x: 0, z: 1 }, [block]);
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i++) expect(overlaps(pathRect(route[i - 1], route[i]), block)).toBe(false);
  });
  it("does not force a path through sealed access or a plot without a street", () => {
    expect(routeToStreet(plot, { x: 0, z: 1 }, [{ x: 0, z: 5, w: 20, d: 1 }])).toEqual([]);
    expect(routeToStreet({ ...plot, edges: { n: false, s: false, e: false, w: false } }, { x: 0, z: 1 }, [])).toEqual([]);
    expect(routeToStreet(plot, { x: 30, z: 1 }, [])).toEqual([]);
  });
  it("keeps new paving and planting clear of buildings across every classic district", () => {
    let paths = 0, gardens = 0;
    for (const district of districts) for (const p of PARCELS.filter(p => p.district === district).slice(0, 8)) {
      const plan = verifyPlan(p); if (plan.route.length) paths++; if (plan.beds.length) gardens++;
    }
    expect(paths).toBeGreaterThan(0); expect(gardens).toBeGreaterThan(0);
  });
  it("also respects property geometry in generated cities", () => {
    for (const seed of [7, 123, 9999]) {
      const parcels = parcelsForLayout(generateCityLayout(seed));
      for (const district of districts) verifyPlan(parcels.find(p => p.district === district)!);
    }
  });
  it("leaves at least four units between suburban house rows and keeps trees out of houses", () => {
    for (const p of PARCELS.filter(p => p.district === "förort").slice(0, 10)) {
      const layout = suburbLayout(p), first = layout.houses[0], second = layout.houses[layout.columns];
      expect(second.z - second.d / 2 - (first.z + first.d / 2)).toBeGreaterThanOrEqual(4);
      for (const tree of layout.trees) expect(layout.houses.some(h => overlaps(h, { ...tree, w: 0.9, d: 0.9 }))).toBe(false);
    }
  });
  it("does not invent a garden inside a dense perimeter building", () => {
    const p = PARCELS.find(p => p.district === "centrum")!;
    expect(groundsPlan(p).paving).toEqual([]); expect(groundsPlan(p).beds).toEqual([]);
  });
  it("is deterministic and never changes the parcel or its street edges", () => {
    const before = JSON.stringify(plot);
    expect(groundsPlan(plot)).toEqual(groundsPlan(plot));
    expect(JSON.stringify(plot)).toBe(before);
  });
  it("reserves villa outbuildings and the industrial plinth", () => {
    const industry = PARCELS.find(p => p.district === "industri")!;
    expect(groundObstacles(industry)[0].w).toBeCloseTo(industry.w * 0.92 + 1);
    expect(PARCELS.filter(p => p.district === "kulle").slice(0, 20).some(p => groundObstacles(p).length > 1)).toBe(true);
  });
});
