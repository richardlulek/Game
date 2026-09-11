import type { Inst } from "./meshHelpers";
import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
export function bayWindowParts(
  width: number,
  floors: number,
  color: string,
  seed: number,
  occupied = true,
  evening = false,
) {
  const walls: Inst[] = [],
    glass: Inst[] = [],
    trim: Inst[] = [],
    glow: Inst[] = [];
  const positions = width > 20 && seed % 2 === 0 ? [-width * 0.25, width * 0.25] : [width * 0.24];
  for (const x of positions)
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * 3;
      walls.push({ x, y: y + 1.5, z: 0.21, sx: 2.4, sy: 3, sz: 0.55 });
      glass.push({ x, y: y + 1.65, z: 0.51, sx: 1.95, sy: 1.75, sz: 0.05 });
      if (evening && occupied && (seed + floor) % 3 === 0)
        glow.push({ x, y: y + 1.65, z: 0.545, sx: 1.8, sy: 1.65, sz: 0.015 });
      for (const side of [-1, 1]) {
        glass.push({ x: x + side * 1.22, y: y + 1.65, z: 0.26, sx: 0.035, sy: 1.75, sz: 0.37 });
        trim.push({ x: x + side * 1.08, y: y + 1.65, z: 0.55, sx: 0.12, sy: 1.92, sz: 0.12 });
      }
      trim.push({ x, y: y + 1.65, z: 0.56, sx: 0.075, sy: 1.75, sz: 0.08 });
      trim.push({ x, y: y + 0.7, z: 0.4, sx: 2.5, sy: 0.16, sz: 0.45 });
      trim.push({ x, y: y + 2.9, z: 0.22, sx: 2.55, sy: 0.2, sz: 0.7 });
    }
  return [
    { items: walls, color },
    { items: glass, color: ARCHITECTURE.glass, glass: true },
    { items: trim, color: architecturePalette(color).frame },
    { items: glow, color: "#e9d4aa", lit: true },
  ];
}
