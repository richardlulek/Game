import { describe, it, expect } from "vitest";
import { BoxGeometry } from "three";
import { facadeDetailGeometry } from "../three/facadeDetailGeometry";
import { urbanFacadeParts } from "../three/urbanFacadeParts";
import { workplaceFacadeParts } from "../three/workplaceFacadeParts";
import { PARCELS, parcelHash, hasAmbientBuilding } from "../engine/city";
import { districtFloors } from "../three/districtBuildings";
import { centrumMassing } from "../three/centrumMassing";
const triangles = (g: ReturnType<typeof facadeDetailGeometry>) =>
  (g.index?.count ?? g.attributes.position.count) / 3;
describe("facade geometry budget", () => {
  it("preserves the outer face and correct outward normal", () => {
    const original = new BoxGeometry(),
      flat = facadeDetailGeometry({ glass: true }, false);
    original.computeBoundingBox();
    flat.computeBoundingBox();
    expect(triangles(flat)).toBe(2);
    expect(flat.boundingBox!.max.z).toBe(original.boundingBox!.max.z);
    expect(flat.boundingBox!.min.x).toBe(original.boundingBox!.min.x);
    expect(flat.boundingBox!.max.y).toBe(original.boundingBox!.max.y);
    for (let i = 0; i < flat.attributes.normal.count; i++)
      expect(flat.attributes.normal.getZ(i)).toBe(1);
    original.dispose();
    flat.dispose();
  });
  it("keeps volume for projections at every level and close-up trim", () => {
    for (const coarse of [false, true]) {
      const g = facadeDetailGeometry({ solid: true }, coarse);
      expect(triangles(g)).toBe(12);
      g.dispose();
    }
    const near = facadeDetailGeometry({}, false),
      far = facadeDetailGeometry({}, true);
    expect(triangles(near)).toBe(12);
    expect(triangles(far)).toBe(2);
    near.dispose();
    far.dispose();
  });
  it("cuts the new ambient facade triangle budget by at least 75% on the default map", () => {
    let before = 0,
      after = 0,
      buildings = 0;
    const count = (
      groups: ReturnType<typeof urbanFacadeParts> | ReturnType<typeof workplaceFacadeParts>,
    ) => {
      for (const g of groups) {
        const geometry = facadeDetailGeometry(g, true);
        before += g.items.length * 12;
        after += g.items.length * triangles(geometry);
        geometry.dispose();
      }
    };
    for (const p of PARCELS) {
      if (
        p.expansion ||
        !hasAmbientBuilding(p) ||
        !["centrum", "innerstad", "hamnen", "industri"].includes(p.district)
      )
        continue;
      buildings++;
      const hash = parcelHash(p.id),
        seed = hash >> 3,
        h = districtFloors(p, hash) * 3,
        color = "#c0b8a0";
      const m = centrumMassing(p, seed),
        base = { color, seed, sx: m.sx, sz: m.sz, classical: true };
      if (p.district === "centrum") {
        count(urbanFacadeParts({ ...base, w: m.mainW, d: m.mainD, h }));
        if (m.hasInside)
          count(
            urbanFacadeParts({
              ...base,
              w: m.wingW,
              d: m.wingD,
              h: m.wingH,
              sx: -m.sx,
              sz: -m.sz,
              entrance: false,
            }),
          );
      } else if (p.district === "innerstad") {
        count(
          urbanFacadeParts({
            ...base,
            w: p.w * 0.96,
            d: p.d * 0.96,
            h,
            classical: seed % 5 < 2,
            shop: seed % 3 === 0,
          }),
        );
        if (seed % 5 >= 2)
          count(
            urbanFacadeParts({
              ...base,
              w: p.w * 0.96 * 0.55,
              d: p.d * 0.96 * 0.55,
              h: 1.8,
              classical: false,
              entrance: false,
            }),
          );
      } else
        count(
          workplaceFacadeParts({
            w: p.w * (p.district === "hamnen" ? 0.9 : 0.92),
            d: p.d * (p.district === "hamnen" ? 0.78 : 0.8),
            h: p.district === "hamnen" ? h * 0.9 : 7 + (seed % 3) * 1.5,
            color,
            warehouse: p.district === "hamnen",
            sx: p.district === "hamnen" ? 0 : m.sx,
            sz: p.district === "hamnen" ? 1 : m.sz,
          }),
        );
    }
    expect(buildings).toBeGreaterThan(0);
    expect(after / before).toBeLessThan(0.25);
    console.info(
      JSON.stringify({
        buildings,
        before,
        after,
        reductionPercent: Math.round((1 - after / before) * 1000) / 10,
        scope: "new ambient facade parts only; default map; excludes shadow passes",
      }),
    );
  });
});
