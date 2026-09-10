import type { Box3, OrthographicCamera, Vector3 } from "three";
import { Vector3 as Vec3 } from "three";

/** Card art is a letterbox in every consumer, so render between the widest
 * (portfolio card, ~2.06) and the narrowest (listing banner, 1.6). */
export const THUMB_W = 512, THUMB_H = 288;
/** Lower than a map view: the facades carry the detail, not the roofs. */
export const THUMB_VIEW = new Vec3(1.1, 0.62, 1.5).normalize();
const MARGIN = 1.07;

const CORNER = new Vec3();

/**
 * Aim the camera at the box, then size the frustum to what the box actually
 * covers on screen. Sizing from a guessed radius instead clips towers and
 * strands cottages in an empty frame, because a bounding sphere says nothing
 * about which way the shape is pointing.
 *
 * `footprint` widens the frame enough for the contact shadow, which reaches
 * past the walls. Returns the projected half-extents for tests to check.
 */
export function frameBox(camera: OrthographicCamera, box: Box3, center: Vector3, size: Vector3) {
  const span = Math.max(size.length(), 4);
  camera.position.copy(center).addScaledVector(THUMB_VIEW, span * 3);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    CORNER.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    CORNER.applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, CORNER.x); maxX = Math.max(maxX, CORNER.x);
    minY = Math.min(minY, CORNER.y); maxY = Math.max(maxY, CORNER.y);
  }

  const footprint = Math.max(size.x, size.z) * 0.62;
  const aspect = THUMB_W / THUMB_H;
  let halfW = Math.max((maxX - minX) / 2 * MARGIN, footprint);
  let halfH = Math.max((maxY - minY) / 2 * MARGIN, footprint * 0.5);
  if (halfW / halfH < aspect) halfW = halfH * aspect; else halfH = halfW / aspect;
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  camera.left = midX - halfW; camera.right = midX + halfW;
  camera.bottom = midY - halfH; camera.top = midY + halfH;
  camera.near = 0.1; camera.far = span * 8;
  camera.updateProjectionMatrix();
  return { halfW, halfH, midX, midY, minX, maxX, minY, maxY, footprint };
}
