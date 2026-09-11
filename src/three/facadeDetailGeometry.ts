import { BoxGeometry, PlaneGeometry } from "three";

export interface FacadeSurface {
  solid?: boolean;
  glass?: boolean;
  lit?: boolean;
}
/** Cosmetic detail keeps the original box's OUTER face. Projections retain volume.
 * Plane is translated before instancing, so the existing thickness scales its
 * offset correctly on all four wall orientations. No extra material batches. */
export function facadeDetailGeometry(surface: FacadeSurface, coarse: boolean) {
  return !surface.solid && (coarse || surface.glass || surface.lit)
    ? new PlaneGeometry(1, 1).translate(0, 0, 0.5)
    : new BoxGeometry();
}
