export type InspectionView = "building" | "entrance" | "yard";
export interface ViewBounds { x: number; z: number; w: number; d: number; h: number; }
export function inspectionPose(bounds: ViewBounds, front: { x: number; z: number; rotation: number; depth: number; width: number }, view: InspectionView, turn: number, fov = 38, courtyard?: { x: number; z: number }) {
  const whole = view === "building", yard = view === "yard";
  const angle = front.rotation + (yard && !courtyard ? Math.PI : 0) + (whole ? Math.PI / 5 : 0) + turn * Math.PI / 4;
  const facadeDistance = front.depth / 2 + 0.4;
  const target = whole ? { x: bounds.x, y: bounds.h * 0.45, z: bounds.z }
    : yard && courtyard ? { ...courtyard, y: 1 } : { x: front.x + Math.sin(front.rotation) * facadeDistance * (yard ? -1 : 1), y: yard ? 1 : 2,
      z: front.z + Math.cos(front.rotation) * facadeDistance * (yard ? -1 : 1) };
  const distance = whole ? Math.min(950, Math.max(25, Math.hypot(bounds.w, bounds.h + 5, bounds.d) * 0.55 / Math.sin(fov * Math.PI / 360)))
    : Math.max(22, Math.min(70, front.width * 1.25));
  const elevation = whole ? 0.55 : yard ? 0.75 : 0.24;
  return { target, position: { x: target.x + Math.sin(angle) * distance * Math.cos(elevation),
    y: target.y + Math.sin(elevation) * distance, z: target.z + Math.cos(angle) * distance * Math.cos(elevation) } };
}
