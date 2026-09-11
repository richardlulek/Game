import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
import type { Inst } from "./meshHelpers";
export interface UrbanFacadeSpec {
  w: number;
  d: number;
  h: number;
  color: string;
  seed: number;
  classical: boolean;
  sx: number;
  sz: number;
  shop?: boolean;
  occupied?: boolean;
  evening?: boolean;
  entrance?: boolean;
  portal?: boolean;
}
/** A single window grid owns openings, projections, sills and balcony placement. */
export function urbanFacadeParts(s: UrbanFacadeSpec) {
  const palette = architecturePalette(s.color);
  const wall: Inst[] = [],
    trim: Inst[] = [],
    glass: Inst[] = [],
    metal: Inst[] = [],
    lit: Inst[] = [];
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const width = nx ? s.d : s.w,
      depth = nx ? s.w : s.d;
    const rotation = nx ? (nx * Math.PI) / 2 : nz < 0 ? Math.PI : 0,
      c = Math.cos(rotation),
      sn = Math.sin(rotation);
    const front = nx === s.sx && nz === s.sz;
    const put = (list: Inst[], x: number, y: number, z: number, w: number, h: number, d: number) =>
      list.push({
        x: (nx * depth) / 2 + x * c + z * sn,
        y,
        z: (nz * depth) / 2 - x * sn + z * c,
        sx: w,
        sy: h,
        sz: d,
        rotY: rotation,
      });
    const bays = Math.max(1, Math.floor((width - 0.8) / 3.1)),
      step = width / bays;
    put(trim, 0, 0.25, 0.04, width, 0.5, 0.12);
    put(trim, 0, s.h - 0.14, 0.08, width + 0.16, 0.22, 0.24);
    if (s.classical && s.h > 4) put(trim, 0, 3.05, 0.055, width, 0.14, 0.17);
    for (let f = 0; f < Math.max(1, Math.floor(s.h / 3)); f++)
      for (let i = 0; i < bays; i++) {
        const x = (i - (bays - 1) / 2) * step;
        if (f === 0 && front && s.entrance !== false && Math.abs(x) < (s.shop ? 3.2 : 2.5))
          continue;
        const wh = Math.min(1.8, s.h - 0.55),
          y = f * 3 + (s.h < 3 ? s.h / 2 : 1.65);
        const ww = Math.min(s.classical ? 1.3 : 1.65, step - 0.65);
        // Funkis bays occupy a column of this same grid, beginning above the entry floor.
        const projection = !s.classical && front && f > 0 && bays >= 3 && i === bays - 2 ? 0.32 : 0;
        if (projection) put(wall, x, f * 3 + 1.5, 0.12, ww + 0.5, 3, 0.48);
        put(trim, x, y, projection + 0.055, ww + 0.22, wh + 0.2, 0.13);
        const light = s.evening && s.occupied !== false && (s.seed + i + f * 7) % 4 === 0;
        put(light ? lit : glass, x, y, projection + 0.13, ww, wh, 0.035);
        put(trim, x, y, projection + 0.165, 0.055, wh, 0.04);
        if (s.classical) put(trim, x, y + 0.3, projection + 0.17, ww, 0.05, 0.04);
        put(trim, x, y - wh / 2 - 0.13, projection + 0.09, ww + 0.35, 0.12, 0.3);
        if (!s.classical && front && f > 0 && i === 0) {
          put(metal, x, f * 3 + 0.9, 0.3, ww + 0.2, 0.055, 0.055);
          for (const dx of [-ww / 2, 0, ww / 2])
            put(metal, x + dx, f * 3 + 0.62, 0.3, 0.045, 0.6, 0.045);
        }
      }
    // A framed ground-floor portal, not a second full-width facade panel.
    if (front && s.entrance !== false && s.portal !== false) {
      put(trim, 0, 1.25, 0.07, 1.65, 2.5, 0.16);
      put(metal, 0, 1.15, 0.17, 1.3, 2.2, 0.07);
      put(glass, 0, 1.52, 0.215, 0.92, 1.15, 0.025);
      put(trim, 0.38, 1.04, 0.25, 0.05, 0.3, 0.04);
      put(trim, 0, 2.56, 0.24, 2.15, 0.14, 0.65);
      if (s.shop)
        for (const side of [-1, 1]) {
          const x = side * Math.min(2.1, width * 0.3),
            ww = Math.min(1.65, width * 0.2);
          put(trim, x, 1.4, 0.055, ww + 0.2, 2.3, 0.13);
          put(glass, x, 1.4, 0.14, ww, 2.08, 0.035);
          put(metal, x, 0.35, 0.18, ww, 0.08, 0.06);
        }
    }
  }
  return [
    { items: wall, color: s.color, solid: true },
    { items: trim, color: palette.frame },
    {
      items: glass,
      color: s.occupied === false ? ARCHITECTURE.vacantGlass : ARCHITECTURE.glass,
      glass: true,
    },
    { items: metal, color: ARCHITECTURE.metal },
    { items: lit, color: "#d8c49a", lit: true },
  ];
}
