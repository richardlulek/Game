import { describe, it, expect } from "vitest";
import { PARCELS, parcelHash } from "../engine/city";
import { financeMassing } from "../three/financeMassing";
import { financeDetails } from "../three/financeDetails";
import { residentialDetails } from "../three/residentialDetails";
import { facadeDetailGeometry } from "../three/facadeDetailGeometry";
import { facadeStructure } from "../three/facadeStructure";
import type { ModelDetailGroup } from "../three/ModelDetails";
const triangles = (groups: ModelDetailGroup[]) =>
  groups.reduce((sum, g) => {
    const geo = facadeDetailGeometry(g, true);
    const n = ((geo.index?.count ?? 0) / 3) * g.items.length;
    geo.dispose();
    return sum + n;
  }, 0);
describe("finance and villa models", () => {
  it("starts the tower above the podium and preserves total height", () => {
    const parcel = PARCELS.find((p) => p.district === "finans")!;
    for (let seed = 0; seed < 12; seed++) {
      const volumes = financeMassing(parcel, 90, seed);
      expect(Math.max(...volumes.map((v) => (v.y ?? 0) + v.h))).toBe(90);
      for (let i = 0; i < volumes.length; i++)
        for (let j = i + 1; j < volumes.length; j++) {
          const a = volumes[i],
            b = volumes[j];
          expect(
            Math.min((a.y ?? 0) + a.h, (b.y ?? 0) + b.h) - Math.max(a.y ?? 0, b.y ?? 0),
          ).toBeLessThanOrEqual(0.00001);
        }
    }
  });
  it("preserves domestic openings when the entry changes to detailed frontage", () => {
    const a = residentialDetails(8, 6, 6, "#bcae94", true, true, true),
      b = residentialDetails(8, 6, 6, "#bcae94", true, false, true);
    const windows = (groups: ModelDetailGroup[]) =>
      groups
        .filter((g) => g.glass)
        .flatMap((g) => g.items)
        .filter((p) => !(p.z > 3 && Math.abs(p.x) < 1));
    expect(windows(a)).toEqual(windows(b));
    expect(
      b
        .filter((g) => g.glass)
        .flatMap((g) => g.items)
        .some((p) => p.z > 3 && Math.abs(p.x) < 1 && p.y < 3),
    ).toBe(false);
  });
  it("bounds background detail cost for both families", () => {
    let before = 0,
      after = 0;
    for (const p of PARCELS.filter(
      (p) => !p.expansion && (p.district === "kulle" || p.district === "finans"),
    )) {
      const seed = parcelHash(p.id) >> 3,
        color = "#bcae94";
      if (p.district === "finans") {
        const volumes = financeMassing(p, 90, seed);
        const groups = financeDetails(volumes, color, seed % 2 === 0, 0, 1);
        after += triangles(groups);
        before += volumes.flatMap((v) => facadeStructure(v, "office", true)).length * 12;
        expect(triangles(groups)).toBeLessThan(600);
      } else {
        const w = p.w * 0.55,
          d = p.d * 0.55,
          h = 6;
        after += triangles(residentialDetails(w, d, h, color, true, true, seed % 3 === 1));
        if (seed % 3 === 0)
          after += triangles(residentialDetails(w * 0.6, d * 0.75, 3, color, false));
        before += facadeStructure({ w, d, h }, "masonry", true).length * 12;
        expect(triangles(residentialDetails(w, d, h, color))).toBeLessThan(400);
      }
    }
    console.info(
      JSON.stringify({
        before,
        after,
        scope: "facade details only, fixed 90m towers and two-storey villas; no shadow passes",
      }),
    );
    expect(after).toBeLessThan(before);
  });
});
