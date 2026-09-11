import type { Inst } from "./meshHelpers";
import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
export function residentialDetails(
  w: number,
  d: number,
  h: number,
  color: string,
  entrance = true,
  portal = true,
  porch = false,
) {
  const trim: Inst[] = [],
    glass: Inst[] = [],
    metal: Inst[] = [],
    solid: Inst[] = [],
    palette = architecturePalette(color);
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const width = nx ? d : w,
      depth = nx ? w : d,
      rotation = nx ? (nx * Math.PI) / 2 : nz < 0 ? Math.PI : 0,
      c = Math.cos(rotation),
      s = Math.sin(rotation);
    const put = (
      items: Inst[],
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) =>
      items.push({
        x: (nx * depth) / 2 + x * c + z * s,
        y,
        z: (nz * depth) / 2 - x * s + z * c,
        sx,
        sy,
        sz,
        rotY: rotation,
      });
    put(trim, 0, 0.22, 0.045, width, 0.44, 0.1);
    put(trim, 0, h - 0.08, 0.045, width + 0.12, 0.16, 0.12);
    for (let floor = 0; floor < Math.round(h / 3); floor++) {
      const positions = width < 3.4 ? [0] : [-width * 0.29, width * 0.29];
      for (const x of positions) {
        const ww = Math.min(1.25, width * 0.23),
          y = floor * 3 + 1.65;
        if (entrance && nz === 1 && floor === 0 && Math.abs(x) < 1) continue;
        put(trim, x, y, 0.055, ww + 0.2, 1.7, 0.12);
        put(glass, x, y, 0.13, ww, 1.5, 0.035);
        put(trim, x, y, 0.165, 0.055, 1.5, 0.035);
        put(trim, x, y - 0.9, 0.09, ww + 0.3, 0.12, 0.28);
      }
    }
    // Corner boards and downpipes use the same wall coordinates as the windows.
    for (const side of [-1, 1]) put(trim, side * (width / 2 - 0.07), h / 2, 0.045, 0.14, h, 0.12);
    if (nz === -1) put(metal, width / 2 - 0.23, h / 2, 0.13, 0.07, h, 0.07);
    if (nz === 1 && entrance && portal) {
      put(trim, 0, 1.17, 0.055, 1.35, 2.34, 0.14);
      put(metal, 0, 1.1, 0.15, 1.12, 2.2, 0.06);
      put(glass, 0, 1.6, 0.195, 0.75, 0.7, 0.025);
      put(trim, 0.37, 1.02, 0.23, 0.05, 0.25, 0.03);
      put(solid, 0, 2.52, porch ? 0.65 : 0.35, porch ? 2.8 : 1.65, 0.13, porch ? 1.6 : 0.85);
      if (porch) {
        put(solid, 0, 0.13, 0.7, 2.7, 0.26, 1.6);
        for (const side of [-1, 1]) put(solid, side * 1.18, 1.35, 1.3, 0.1, 2.3, 0.1);
      }
    }
  }
  return [
    { items: trim, color: palette.frame },
    { items: glass, color: ARCHITECTURE.glass, glass: true },
    { items: metal, color: ARCHITECTURE.metal },
    { items: solid, color: palette.base, solid: true },
  ];
}
