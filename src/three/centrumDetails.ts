import type { Inst } from "./meshHelpers";

/** Ten-sided cylinder: windows lie on the face planes, never inside the wall. */
export function turretDetails(floors: number) {
  const frames: Inst[] = [], panes: Inst[] = [], bands: Inst[] = [];
  const radius = 2;
  const apothem = radius * Math.cos(Math.PI / 10);
  for (let floor = 0; floor < floors; floor++) {
    for (let face = 0; face < 10; face++) {
      const angle = (face + 0.5) * Math.PI * 2 / 10;
      const place = (distance: number, y: number, sx: number, sy: number, sz: number): Inst => ({
        x: Math.sin(angle) * distance, y, z: Math.cos(angle) * distance,
        sx, sy, sz, rotY: angle,
      });
      const y = floor * 3 + 1.65;
      frames.push(place(apothem + 0.055, y, 0.98, 1.85, 0.16));
      panes.push(place(apothem + 0.15, y, 0.72, 1.55, 0.06));
      frames.push(place(apothem + 0.22, y - 0.93, 1.1, 0.13, 0.36));
      frames.push(place(apothem + 0.20, y, 0.06, 1.55, 0.045));
    }
    bands.push({ x: 0, y: floor * 3 + 0.18, z: 0, sx: 2.08, sy: 0.22, sz: 2.08 });
  }
  bands.push({ x: 0, y: 0.23, z: 0, sx: 2.12, sy: 0.46, sz: 2.12 });
  bands.push({ x: 0, y: floors * 3 + 1.42, z: 0, sx: 2.24, sy: 0.36, sz: 2.24 });
  return { frames, panes, bands };
}
