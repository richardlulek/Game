/* ============================================================
   Procedurella texturer – fönstergrid ritat på canvas, delas av
   alla byggnader. Ingen extern asset-pipeline behövs; materialets
   color-tint ger varje hus sin fasadfärg (vit bakgrund × färg).
   ============================================================ */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

let sharedWindowCanvas: HTMLCanvasElement | null = null;

/** Ett "kakel" = en våning med ett fönster; repeat ger hela fasaden. */
function drawWindowTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  // Fasad (vit – tintas av materialfärgen)
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 64);
  // Fönster med karm och svag "glas"-gradient
  g.fillStyle = "#454d55";
  g.fillRect(14, 16, 36, 34);
  const glass = g.createLinearGradient(0, 16, 0, 50);
  glass.addColorStop(0, "#87919b");
  glass.addColorStop(1, "#4c545c");
  g.fillStyle = glass;
  g.fillRect(17, 19, 30, 28);
  // Bjälklagsskugga nederst på våningen
  g.fillStyle = "rgba(0,0,0,0.10)";
  g.fillRect(0, 58, 64, 6);
  return c;
}

/**
 * Fönstertextur med angivet antal upprepningar (fönster i bredd ×
 * våningar i höjd). Bilden delas – bara textur-objektet klonas.
 */
export function windowTexture(repeatX: number, repeatY: number): CanvasTexture {
  if (!sharedWindowCanvas) sharedWindowCanvas = drawWindowTile();
  const tex = new CanvasTexture(sharedWindowCanvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
