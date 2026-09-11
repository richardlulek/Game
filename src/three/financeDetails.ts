import type { Inst } from "./meshHelpers";
import type { StructureVolume } from "./facadeStructure";
import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
export function financeDetails(
  volumes: StructureVolume[],
  color: string,
  hasPodium: boolean,
  sx: number,
  sz: number,
  portal = true,
) {
  const trim: Inst[] = [],
    glass: Inst[] = [],
    solid: Inst[] = [],
    palette = architecturePalette(color);
  volumes.forEach((v, index) => {
    const angle = v.rotation ?? 0,
      c = Math.cos(angle),
      s = Math.sin(angle),
      podium = hasPodium && index === 0;
    for (const [nx, nz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const width = nx ? v.d : v.w,
        depth = nx ? v.w : v.d,
        face = nx ? (nx * Math.PI) / 2 : nz < 0 ? Math.PI : 0,
        cf = Math.cos(face),
        sf = Math.sin(face);
      const put = (
        items: Inst[],
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
      ) => {
        const lx = (nx * depth) / 2 + x * cf + z * sf,
          lz = (nz * depth) / 2 - x * sf + z * cf;
        items.push({
          x: (v.x ?? 0) + lx * c + lz * s,
          y: (v.y ?? 0) + y,
          z: (v.z ?? 0) - lx * s + lz * c,
          sx: w,
          sy: h,
          sz: d,
          rotY: angle + face,
        });
      };
      const bays = Math.max(2, Math.min(5, Math.floor(width / 4)));
      for (let i = 0; i <= bays; i++)
        put(trim, -width / 2 + (i * width) / bays, v.h / 2, 0.07, podium ? 0.16 : 0.09, v.h, 0.16);
      put(trim, 0, v.h - 0.12, 0.055, width + 0.16, 0.24, 0.14);
      if (podium) {
        put(trim, 0, 0.3, 0.05, width, 0.6, 0.12);
        for (let floor = 0; floor < Math.floor(v.h / 3); floor++)
          for (let i = 0; i < bays; i++) {
            const x = ((i - (bays - 1) / 2) * width) / bays;
            if (floor === 0 && nx === sx && nz === sz && Math.abs(x) < 2.4) continue;
            put(glass, x, floor * 3 + 1.65, 0.11, width / bays - 0.4, 2, 0.04);
          }
      }
      if ((v.y ?? 0) === 0 && nx === sx && nz === sz && portal) {
        put(trim, 0, 1.5, 0.12, 2.6, 3, 0.2);
        put(glass, 0, 1.48, 0.24, 2.3, 2.8, 0.05);
        put(trim, 0, 1.48, 0.28, 0.07, 2.8, 0.04);
        put(solid, 0, 3.2, 0.5, 3.1, 0.16, 1.25);
      }
    }
  });
  return [
    { items: trim, color: palette.frame },
    { items: glass, color: ARCHITECTURE.glass, glass: true },
    { items: solid, color: palette.base, solid: true },
  ];
}
