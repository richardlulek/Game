import { describe, expect, it } from "vitest";
import { buildRoadGraph, makeTrafficRoutes, sampleRoute } from "../three/trafficRoutes";
import { CLASSIC_ROADS, roadsForLayout } from "../engine/roadGen";
import { generateCityLayout } from "../engine/cityLayout";
import { zoneStreets } from "../engine/city";
import type { RoadSeg } from "../engine/roadGen";

const rectangle: RoadSeg[] = [
  { x: 0, z: -20, w: 40, d: 6 }, { x: 0, z: 20, w: 40, d: 6 },
  { x: -20, z: 0, w: 6, d: 40 }, { x: 20, z: 0, w: 6, d: 40 },
];
const onRoad = (x: number, z: number, roads: RoadSeg[]) => roads.some(r =>
  Math.abs(x - r.x) <= r.w / 2 + 0.001 && Math.abs(z - r.z) <= r.d / 2 + 0.001);

describe("continuous city traffic", () => {
  it("splits crossings into a connected junction", () => {
    const graph = buildRoadGraph([{ x: 0, z: 0, w: 40, d: 6 }, { x: 0, z: 0, w: 6, d: 40 }]);
    expect(graph).toHaveLength(5);
    expect(graph.find(n => n.x === 0 && n.z === 0)?.links).toHaveLength(4);
  });
  it("joins overlapping road sections without duplicate edges", () => {
    const graph = buildRoadGraph([{ x: 0, z: 0, w: 40, d: 6 }, { x: 10, z: 0, w: 40, d: 6 }]);
    for (const n of graph) expect(new Set(n.links.map(l => l.to)).size).toBe(n.links.length);
    expect(graph.every(n => n.links.length > 0)).toBe(true);
  });
  it("closes circuits without a position jump at the wrap point", () => {
    const routes = makeTrafficRoutes(rectangle, 5);
    expect(routes).toHaveLength(5);
    for (const route of routes) {
      const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
      sampleRoute(route, route.length - 0.01, a); sampleRoute(route, 0.01, b);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThanOrEqual(0.021);
    }
  });
  it("keeps every rounded corner on the actual road surface", () => {
    const roads = [...CLASSIC_ROADS, ...zoneStreets()];
    const routes = makeTrafficRoutes(roads, 90);
    expect(routes.length).toBe(90);
    for (const route of routes) for (const p of route.points) expect(onRoad(p.x, p.z, roads)).toBe(true);
  });
  it("is deterministic and does not invent routes across disconnected dead ends", () => {
    expect(makeTrafficRoutes(rectangle, 4)).toEqual(makeTrafficRoutes(rectangle, 4));
    expect(makeTrafficRoutes([{ x: 0, z: 0, w: 40, d: 6 }], 4)).toEqual([]);
  });
  it("stays on roads in generated cities", () => {
    for (const seed of [1, 7, 123, 9999]) {
      const layout = generateCityLayout(seed);
      const roads = [...roadsForLayout(layout), ...zoneStreets(layout.zones)];
      const routes = makeTrafficRoutes(roads, 24);
      expect(routes).toHaveLength(24);
      for (const route of routes) for (const p of route.points) expect(onRoad(p.x, p.z, roads)).toBe(true);
    }
  });
  it("travels by distance rather than by road-segment length", () => {
    const route = makeTrafficRoutes(rectangle, 1)[0];
    const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
    for (let d = 0; d < route.length; d += 0.5) {
      sampleRoute(route, d, a); sampleRoute(route, d + 0.5, b);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThanOrEqual(0.501);
    }
  });
});
