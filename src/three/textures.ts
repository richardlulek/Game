/* ============================================================
   Procedurella texturer – ritas på canvas och delas av alla
   byggnader/marken. Ingen extern asset-pipeline behövs;
   materialets color-tint ger varje hus sin fasadfärg.
   ============================================================ */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

let sharedWindowCanvas: HTMLCanvasElement | null = null;
let sharedGroundCanvas: HTMLCanvasElement | null = null;

/** Deterministisk PRNG så texturerna blir likadana varje session. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ett "kakel" = 4×4 fönster (4 våningar). Varje fönster får egen
 * glasnyans och ett fåtal lyser varmt – fasaderna ser bebodda ut.
 * Vit bakgrund tintas av materialfärgen.
 */
function drawWindowTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const rand = mulberry32(1337);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  const CELL = 64;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * CELL;
      const y = row * CELL;
      // Karm
      g.fillStyle = "#454d55";
      g.fillRect(x + 14, y + 16, 36, 34);
      const lit = rand() < 0.16;
      if (lit) {
        // Tänt fönster – varmt sken med ljusare topp
        const warm = g.createLinearGradient(0, y + 19, 0, y + 47);
        warm.addColorStop(0, "#ffe3ae");
        warm.addColorStop(1, "#e8b45f");
        g.fillStyle = warm;
        g.fillRect(x + 17, y + 19, 30, 28);
      } else {
        // Släckt glas – blågrå gradient med individuell nyans
        const shade = 1.0 + rand() * 0.35;
        const glass = g.createLinearGradient(0, y + 16, 0, y + 50);
        glass.addColorStop(0, `rgb(${Math.min(255, 148 * shade) | 0},${Math.min(255, 158 * shade) | 0},${Math.min(255, 168 * shade) | 0})`);
        glass.addColorStop(1, `rgb(${88 * shade | 0},${96 * shade | 0},${104 * shade | 0})`);
        g.fillStyle = glass;
        g.fillRect(x + 17, y + 19, 30, 28);
        // Diagonal himmelsreflex i somliga rutor
        if (rand() < 0.4) {
          g.fillStyle = "rgba(255,255,255,0.14)";
          g.beginPath();
          g.moveTo(x + 17, y + 33);
          g.lineTo(x + 31, y + 19);
          g.lineTo(x + 41, y + 19);
          g.lineTo(x + 17, y + 43);
          g.closePath();
          g.fill();
        }
      }
      // Fönsterpost
      g.fillStyle = "#454d55";
      g.fillRect(x + 30, y + 19, 3, 28);
      // Bjälklagsskugga nederst på våningen
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, y + 58, CELL, 6);
    }
  }
  return c;
}

/**
 * Fönstertextur. repeatX/repeatY anges i FÖNSTER respektive VÅNINGAR;
 * kaklet innehåller 4×4 fönster så repeat delas med 4 internt.
 * Canvasen delas – bara textur-objektet klonas.
 */
export function windowTexture(repeatX: number, repeatY: number): CanvasTexture {
  if (!sharedWindowCanvas) sharedWindowCanvas = drawWindowTile();
  const tex = new CanvasTexture(sharedWindowCanvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Subtilt melerad marktextur – bryter den stora slättens platthet. */
function drawGroundTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const rand = mulberry32(4711);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  // Stora mjuka fläckar (ängar/fält i svagt olika ton)
  for (let i = 0; i < 16; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 22 + rand() * 46;
    const dark = rand() < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, dark ? "rgba(74,92,58,0.055)" : "rgba(255,255,230,0.055)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fint brus
  for (let i = 0; i < 700; i++) {
    const v = rand();
    g.fillStyle = v < 0.5 ? "rgba(64,78,52,0.035)" : "rgba(255,255,240,0.035)";
    g.fillRect(rand() * 256, rand() * 256, 1.5 + rand() * 2, 1.5 + rand() * 2);
  }
  return c;
}

/** Marktextur med angivet antal upprepningar över planet. */
export function groundTexture(repeat: number): CanvasTexture {
  if (!sharedGroundCanvas) sharedGroundCanvas = drawGroundTile();
  const tex = new CanvasTexture(sharedGroundCanvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
