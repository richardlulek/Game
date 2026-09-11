import { architecturePalette, ARCHITECTURE } from "./architecturePalette";
/** Garage/förråd has wall, coping, recessed door, side window and a plinth. */
export function villaAnnex(w: number, d: number, wall: string) {
  const palette = architecturePalette(wall),
    x = w * 0.85,
    z = -d * 0.5;
  return [
    { x, y: 1.2, z, sx: 4, sy: 2.4, sz: 3.4, color: wall },
    { x, y: 0.15, z, sx: 4.08, sy: 0.3, sz: 3.48, color: palette.base },
    { x, y: 2.48, z, sx: 4.2, sy: 0.16, sz: 3.6, color: ARCHITECTURE.roof },
    { x, y: 1.18, z: z + 1.72, sx: 3.1, sy: 2.06, sz: 0.08, color: palette.frame },
    { x, y: 1.2, z: z + 1.78, sx: 2.8, sy: 1.8, sz: 0.05, color: ARCHITECTURE.metal },
    { x, y: 0.85, z: z + 1.82, sx: 0.35, sy: 0.07, sz: 0.05, color: palette.frame },
    { x: x + 2.03, y: 1.5, z, sx: 0.08, sy: 0.8, sz: 1.1, color: palette.frame },
    { x: x + 2.08, y: 1.5, z, sx: 0.04, sy: 0.62, sz: 0.92, color: ARCHITECTURE.glass },
    ...[0.55, 0.95, 1.35, 1.75].map((y) => ({
      x,
      y,
      z: z + 1.81,
      sx: 2.7,
      sy: 0.025,
      sz: 0.025,
      color: palette.base,
    })),
  ];
}
