import { describe, it, expect } from "vitest";
import { urbanFacadeParts } from "../three/urbanFacadeParts";
import { workplaceFacadeParts } from "../three/workplaceFacadeParts";
const city = { w: 18, d: 15, h: 18, color: "#c9bea7", seed: 4, classical: true, sx: 0, sz: 1 };
describe("integrated district facades", () => {
  it("keeps city openings within walls at all four street orientations", () => {
    for (const [sx, sz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ])
      for (const classical of [true, false]) {
        const groups = urbanFacadeParts({ ...city, sx, sz, classical });
        for (const g of groups)
          for (const p of g.items) {
            expect([p.x, p.y, p.z, p.sx, p.sy, p.sz, p.rotY].every(Number.isFinite)).toBe(true);
            expect(p.y - (p.sy ?? 0) / 2).toBeGreaterThanOrEqual(-0.001);
            expect(p.y + (p.sy ?? 0) / 2).toBeLessThanOrEqual(city.h + 0.001);
            expect(Math.abs(p.x)).toBeLessThan(city.w / 2 + 1);
            expect(Math.abs(p.z)).toBeLessThan(city.d / 2 + 1);
          }
      }
  });
  it("reserves the entrance for detailed frontage without drawing a second portal", () => {
    const groups = urbanFacadeParts({ ...city, portal: false });
    const panes = groups.filter((g) => g.glass).flatMap((g) => g.items);
    expect(panes.some((p) => p.z > city.d / 2 && p.y < 3 && Math.abs(p.x) < 2.5)).toBe(false);
    expect(panes.some((p) => p.z > city.d / 2 && p.y > 3)).toBe(true);
  });
  it("keeps the same window grid when occupancy and lighting change", () => {
    const panes = (evening: boolean, occupied: boolean) =>
      urbanFacadeParts({ ...city, evening, occupied })
        .filter((g) => g.glass || g.lit)
        .flatMap((g) => g.items)
        .map((p) => JSON.stringify(p))
        .sort();
    expect(panes(true, true)).toEqual(panes(false, true));
    expect(panes(false, false)).toEqual(panes(false, true));
  });
  it("fits attic windows under the low roof and limits material batches", () => {
    const groups = urbanFacadeParts({ ...city, h: 1.8, entrance: false });
    for (const g of groups)
      for (const p of g.items) expect(p.y + (p.sy ?? 0) / 2).toBeLessThanOrEqual(1.81);
    expect(groups.length).toBeLessThanOrEqual(5);
  });
  it("distinguishes multi-storey warehouses from high-window production halls", () => {
    const spec = { w: 20, d: 16, h: 8.1, color: "#9b8c77", sx: 0, sz: 1 };
    const hall = workplaceFacadeParts({ ...spec, warehouse: false }),
      warehouse = workplaceFacadeParts({ ...spec, warehouse: true });
    const hallWindows = hall
      .filter((g) => g.glass)
      .flatMap((g) => g.items)
      .filter((p) => p.z < 0);
    expect(hallWindows.every((p) => p.y > 5)).toBe(true);
    expect(
      new Set(
        warehouse
          .filter((g) => g.glass)
          .flatMap((g) => g.items)
          .map((p) => p.y),
      ).size,
    ).toBeGreaterThan(2);
    for (const groups of [hall, warehouse])
      for (const g of groups)
        for (const p of g.items) {
          expect([p.x, p.y, p.z, p.sx, p.sy, p.sz].every(Number.isFinite)).toBe(true);
          expect(p.y + (p.sy ?? 0) / 2).toBeLessThanOrEqual(spec.h + 0.01);
        }
  });
});
