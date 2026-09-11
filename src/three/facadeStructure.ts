export type StructureKind = "office" | "masonry" | "industrial" | "warehouse";
export interface StructureVolume { w: number; d: number; h: number; x?: number; y?: number; z?: number; rotation?: number; }
export interface StructurePart { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; surface: "frame" | "base" | "glass"; }

/** Structural rhythm belongs to each volume, including rotated/setback towers.
 * Coarse mode retains the plinth, cornice and major divisions at all distances. */
export function facadeStructure(v: StructureVolume, kind: StructureKind, coarse: boolean, entry?: [number, number]): StructurePart[] {
  if (Math.min(v.w, v.d, v.h) <= 0) return [];
  const parts: StructurePart[] = [], angle = v.rotation ?? 0, c = Math.cos(angle), s = Math.sin(angle);
  const add = (surface: StructurePart["surface"], x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts.push({ surface, x: (v.x ?? 0) + x * c + z * s, y: (v.y ?? 0) + y, z: (v.z ?? 0) - x * s + z * c, sx, sy, sz, rotY: angle });
  const ring = (y: number, height: number, surface: StructurePart["surface"]) => {
    for (const side of [-1, 1]) {
      add(surface, 0, y, side * (v.d / 2 + 0.065), v.w + 0.18, height, 0.13);
      add(surface, side * (v.w / 2 + 0.065), y, 0, 0.13, height, v.d + 0.18);
    }
  };
  const plinth = Math.min(0.7, v.h * 0.12), coping = Math.min(0.25, v.h * 0.08);
  ring(plinth / 2, plinth, "base"); ring(v.h - coping / 2, coping, "frame");
  const utilitarian = kind === "industrial" || kind === "warehouse";
  // Window/floor bands for offices; load-bearing wall bays for halls/warehouses.
  if (!utilitarian) {
    const step = Math.max(3, Math.ceil(v.h / ((coarse ? 3 : 12) * 3)) * 3);
    for (let y = 3; y < v.h - 1; y += step) ring(y, kind === "office" ? 0.1 : 0.18, "frame");
  }
  const count = coarse ? 2 : Math.max(2, Math.min(7, Math.floor(v.w / 4)));
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    const x = -v.w / 2 + 0.2 + i * (v.w - 0.4) / (count - 1);
    add("frame", x, v.h / 2, side * (v.d / 2 + 0.08), kind === "warehouse" ? 0.24 : 0.12, v.h - coping, 0.16);
  }
  if (utilitarian && v.h >= 4) {
    // High daylight windows leave lower walls free for storage or production.
    for (const side of [-1, 1]) add("glass", 0, v.h * 0.76, side * (v.d / 2 + 0.105), v.w * 0.72, Math.min(1.15, v.h * 0.14), 0.06);
    if (!coarse) for (let i = 1; i < 5; i++) for (const side of [-1, 1]) add("frame", (i / 5 - 0.5) * v.w * 0.72, v.h * 0.76, side * (v.d / 2 + 0.15), 0.08, Math.min(1.15, v.h * 0.14), 0.04);
  }
  if (entry) {
    const [sx, sz] = entry, width = Math.min(utilitarian ? 4.2 : 2.4, (sx ? v.d : v.w) * 0.45), height = Math.min(utilitarian ? 3.8 : 2.6, v.h * 0.8);
    add(utilitarian ? "frame" : "glass", sx * (v.w / 2 + 0.13), height / 2, sz * (v.d / 2 + 0.13), sx ? 0.2 : width, height, sx ? width : 0.2);
    add("base", sx * (v.w / 2 + 0.35), height + 0.1, sz * (v.d / 2 + 0.35), sx ? 0.7 : width + 0.4, 0.18, sx ? width + 0.4 : 0.7);
  }
  return parts;
}
