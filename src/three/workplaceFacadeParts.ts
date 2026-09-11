import type { Inst } from "./meshHelpers";
import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
export interface WorkplaceSpec {
  w: number;
  d: number;
  h: number;
  color: string;
  warehouse: boolean;
  sx: number;
  sz: number;
  entrance?: boolean;
}
/** Hall cladding and warehouse masonry share the building's structural bay spacing. */
export function workplaceFacadeParts(s: WorkplaceSpec) {
  const palette = architecturePalette(s.color),
    trim: Inst[] = [],
    glass: Inst[] = [],
    metal: Inst[] = [],
    base: Inst[] = [];
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const width = nx ? s.d : s.w,
      depth = nx ? s.w : s.d,
      angle = nx ? (nx * Math.PI) / 2 : nz < 0 ? Math.PI : 0,
      c = Math.cos(angle),
      sn = Math.sin(angle),
      front = nx === s.sx && nz === s.sz;
    const put = (items: Inst[], x: number, y: number, z: number, w: number, h: number, d: number) =>
      items.push({
        x: (nx * depth) / 2 + x * c + z * sn,
        y,
        z: (nz * depth) / 2 - x * sn + z * c,
        sx: w,
        sy: h,
        sz: d,
        rotY: angle,
      });
    put(base, 0, 0.3, 0.045, width, 0.6, 0.14);
    put(trim, 0, s.h - 0.12, 0.075, width + 0.16, 0.2, 0.22);
    const count = Math.max(2, Math.floor(width / 3.5)),
      step = width / count;
    for (let i = 0; i <= count; i++) {
      const x = -width / 2 + i * step;
      put(trim, x, s.h / 2, 0.045, s.warehouse ? 0.18 : 0.065, s.h - 0.3, 0.1);
    }
    if (s.warehouse) {
      const floors = Math.max(2, Math.round(s.h / 2.7)),
        fh = s.h / floors;
      for (let f = 0; f < floors; f++)
        for (let i = 0; i < count; i++) {
          const x = (i - (count - 1) / 2) * step;
          if (front && f === 0) continue;
          const y = f * fh + fh * 0.58;
          put(trim, x, y, 0.07, 1.28, 1.58, 0.14);
          put(glass, x, y, 0.15, 1.06, 1.36, 0.04);
          put(metal, x, y, 0.19, 0.05, 1.36, 0.03);
          put(metal, x, y, 0.19, 1.06, 0.05, 0.03);
          put(base, x, y - 0.86, 0.12, 1.45, 0.12, 0.32);
        }
    } else {
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * step,
          ww = Math.min(2.5, step - 0.4),
          y = s.h - 1.65;
        put(trim, x, y, 0.08, ww + 0.16, 1.4, 0.15);
        put(glass, x, y, 0.17, ww, 1.18, 0.035);
        put(metal, x, y, 0.21, 0.06, 1.18, 0.04);
      }
      for (let y = 1.3; y < s.h - 2.5; y += 1.25)
        if (!front) put(trim, 0, y, 0.035, width, 0.035, 0.06);
    }
    if (front && s.entrance !== false) {
      const doorW = Math.min(4.2, width * 0.42),
        doorH = Math.min(s.warehouse ? 3.1 : 3.8, s.h - 2.8);
      put(trim, 0, doorH / 2, 0.1, doorW + 0.35, doorH + 0.2, 0.25);
      put(metal, 0, doorH / 2, 0.26, doorW, doorH, 0.07);
      for (let y = 0.35; y < doorH; y += 0.42) put(base, 0, y, 0.31, doorW - 0.12, 0.035, 0.04);
      put(trim, 0, doorH + 0.25, 0.45, doorW + 0.65, 0.12, 0.9);
      const x = width * 0.34;
      if (width > 9) {
        put(trim, x, 1.16, 0.09, 1.15, 2.3, 0.16);
        put(metal, x, 1.1, 0.19, 0.95, 2.15, 0.05);
        put(glass, x, 1.52, 0.23, 0.65, 0.65, 0.025);
      }
    }
  }
  return [
    { items: trim, color: palette.frame },
    { items: glass, color: ARCHITECTURE.glass, glass: true },
    { items: metal, color: ARCHITECTURE.metal },
    { items: base, color: palette.base },
  ];
}
