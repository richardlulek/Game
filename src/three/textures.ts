/* ============================================================
   Procedurella texturer – ritas på canvas och delas av alla
   byggnader/marken. Ingen extern asset-pipeline behövs;
   materialets color-tint ger varje hus sin fasadfärg.
   ============================================================ */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

let sharedWindowCanvas: HTMLCanvasElement | null = null;
let sharedGlassCanvas: HTMLCanvasElement | null = null;
let sharedGroundCanvas: HTMLCanvasElement | null = null;

/** Texturer cachas per repeat-nyckel: hus med samma mått delar GPU-textur.
 *  Cachade texturer får ALDRIG disposas av enskilda material. */
const textureCache = new Map<string, CanvasTexture>();

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
  const key = `win:${repeatX}x${repeatY}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedWindowCanvas) sharedWindowCanvas = drawWindowTile();
  const tex = new CanvasTexture(sharedWindowCanvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Fönsterkakel med repeat (1,1) – för sammanslagen geometri där
 *  upprepningen i stället bakas in i varje boxs UV-koordinater. */
export function windowTileTexture(): CanvasTexture {
  return windowTexture(4, 4); // repeat 1,1 (kaklet är 4×4 fönster)
}

/* ============================================================
   Fasadfamiljer per fastighetstyp + tillståndsvarianter.
   Kaklet är alltid 4×4 celler à 64 px på vit botten (tintas av
   materialfärgen). Varianterna kopplar 3D-vyn till spelläget:
     normal  – blandat tänt/släckt
     tänt    – fullt uthyrt: många varma fönster
     släckt  – vakant: dött hus, inga tända fönster
     sliten  – lågt skick: smuts och färre tända
   ============================================================ */

export type FacadeKind = "bostad" | "kontor" | "butik" | "industri";
export type FacadeVariant = "normal" | "tänt" | "släckt" | "sliten";

const facadeCanvasCache = new Map<string, HTMLCanvasElement>();

/** Andel tända fönster per variant (multipliceras per typ). */
const LIT_SHARE: Record<FacadeVariant, number> = {
  normal: 1,
  tänt: 2.6,
  släckt: 0,
  sliten: 0.5,
};

const CURTAIN_COLORS = ["#e8ddc8", "#d8c8b8", "#e2d4d0", "#ccd4c8"];
const SIGN_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f"];

function drawFacadeTile(kind: FacadeKind, variant: FacadeVariant): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const rand = mulberry32(kind.length * 1000 + variant.length * 77 + 42);
  const CELL = 64;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  const lit = (base: number) => rand() < base * LIT_SHARE[variant];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * CELL;
      const y = row * CELL;

      if (kind === "bostad") {
        // Bostadsfönster med gardiner; var ~femte cell är balkongdörr.
        const door = rand() < 0.2;
        const wx = x + (door ? 20 : 14);
        const wy = y + (door ? 10 : 16);
        const ww = door ? 24 : 36;
        const wh = door ? 46 : 34;
        g.fillStyle = "#4a4a44";
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        if (lit(0.16)) {
          const warm = g.createLinearGradient(0, wy, 0, wy + wh);
          warm.addColorStop(0, "#ffe3ae");
          warm.addColorStop(1, "#e8b45f");
          g.fillStyle = warm;
          g.fillRect(wx, wy, ww, wh);
        } else {
          g.fillStyle = `rgb(${120 + rand() * 40 | 0},${130 + rand() * 40 | 0},${140 + rand() * 40 | 0})`;
          g.fillRect(wx, wy, ww, wh);
        }
        // Gardiner i sidorna
        if (!door && rand() < 0.65) {
          g.fillStyle = CURTAIN_COLORS[(rand() * CURTAIN_COLORS.length) | 0];
          g.fillRect(wx, wy, 6, wh);
          g.fillRect(wx + ww - 6, wy, 6, wh);
        }
        // Balkongräcke framför dörren
        if (door) {
          g.fillStyle = "rgba(60,60,58,0.85)";
          g.fillRect(x + 12, y + 38, 40, 3);
          for (let b = 0; b < 6; b++) g.fillRect(x + 14 + b * 7, y + 38, 2, 16);
        }
      } else if (kind === "kontor") {
        // Brett kontorsband med persienner; kallt ljus.
        const wx = x + 8;
        const wy = y + 18;
        g.fillStyle = "#3e454c";
        g.fillRect(wx - 2, wy - 2, 52, 32);
        if (lit(0.12)) {
          g.fillStyle = "#e8f0f8";
          g.fillRect(wx, wy, 48, 28);
          g.fillStyle = "rgba(150,160,170,0.5)";
          g.fillRect(wx + 22, wy, 3, 28); // interiörpost
        } else {
          const shade = 0.9 + rand() * 0.3;
          const glass = g.createLinearGradient(0, wy, 0, wy + 28);
          glass.addColorStop(0, `rgb(${150 * shade | 0},${162 * shade | 0},${174 * shade | 0})`);
          glass.addColorStop(1, `rgb(${92 * shade | 0},${102 * shade | 0},${112 * shade | 0})`);
          g.fillStyle = glass;
          g.fillRect(wx, wy, 48, 28);
        }
        // Persienner halvt nerdragna i hälften av cellerna
        if (rand() < 0.5) {
          const drop = 8 + rand() * 14;
          g.fillStyle = "rgba(226,222,208,0.92)";
          g.fillRect(wx, wy, 48, drop);
          g.strokeStyle = "rgba(120,116,104,0.5)";
          g.lineWidth = 1;
          for (let l = 3; l < drop; l += 3.5) {
            g.beginPath();
            g.moveTo(wx, wy + l);
            g.lineTo(wx + 48, wy + l);
            g.stroke();
          }
        }
        g.fillStyle = "#3e454c";
        g.fillRect(wx + 23, wy - 2, 2, 32); // mittpost
      } else if (kind === "butik") {
        // Stora skyltfönster med varmt skyltljus och skyltband.
        const wx = x + 6;
        const wy = y + 14;
        g.fillStyle = "#2e3338";
        g.fillRect(wx - 2, wy - 2, 56, 42);
        if (lit(0.3)) {
          const glow = g.createLinearGradient(0, wy, 0, wy + 38);
          glow.addColorStop(0, "#ffedc2");
          glow.addColorStop(1, "#e8c47f");
          g.fillStyle = glow;
          g.fillRect(wx, wy, 52, 38);
          // Silhuetter av varor i fönstret
          g.fillStyle = "rgba(90,70,50,0.55)";
          g.fillRect(wx + 6 + rand() * 8, wy + 20, 8, 18);
          g.fillRect(wx + 28 + rand() * 8, wy + 24, 10, 14);
        } else {
          g.fillStyle = `rgb(${110 + rand() * 30 | 0},${118 + rand() * 30 | 0},${126 + rand() * 30 | 0})`;
          g.fillRect(wx, wy, 52, 38);
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.fillRect(wx, wy + 4, 52, 6);
        }
        // Skyltband ovanför fönstret
        if (rand() < 0.6) {
          g.fillStyle = SIGN_COLORS[(rand() * SIGN_COLORS.length) | 0];
          g.fillRect(wx, y + 4, 52, 8);
        }
      } else {
        // Industri: profilplåt med högt fönsterband och ventiler.
        g.fillStyle = "rgba(0,0,0,0.07)";
        for (let px = 0; px < CELL; px += 8) g.fillRect(x + px, y, 3, CELL);
        g.fillStyle = "#3a4046";
        g.fillRect(x + 6, y + 8, 52, 14);
        if (lit(0.14)) {
          g.fillStyle = "#f4e8be";
          g.fillRect(x + 8, y + 10, 48, 10);
        } else {
          g.fillStyle = `rgb(${128 + rand() * 26 | 0},${136 + rand() * 26 | 0},${142 + rand() * 26 | 0})`;
          g.fillRect(x + 8, y + 10, 48, 10);
        }
        g.fillStyle = "rgba(0,0,0,0.18)";
        for (let p = 0; p < 5; p++) g.fillRect(x + 10 + p * 10, y + 10, 2, 10);
        // Ventil/lucka
        if (rand() < 0.3) {
          g.fillStyle = "#6a7076";
          g.fillRect(x + 40, y + 38, 14, 14);
          g.fillStyle = "rgba(0,0,0,0.3)";
          for (let v = 0; v < 3; v++) g.fillRect(x + 42, y + 41 + v * 4, 10, 2);
        }
      }

      // Bjälklagsskugga
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, y + 58, CELL, 6);
    }
  }

  // Sliten: smutsfläckar och rinnmärken under fönstren.
  if (variant === "sliten") {
    for (let i = 0; i < 26; i++) {
      const bx = rand() * 256;
      const by = rand() * 256;
      const r = 8 + rand() * 22;
      const blot = g.createRadialGradient(bx, by, 0, bx, by, r);
      blot.addColorStop(0, "rgba(58,50,40,0.20)");
      blot.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = blot;
      g.fillRect(bx - r, by - r, r * 2, r * 2);
    }
    for (let i = 0; i < 12; i++) {
      const sx = 12 + rand() * 232;
      const sy = ((rand() * 4) | 0) * 64 + 50;
      g.fillStyle = "rgba(52,46,38,0.16)";
      g.fillRect(sx, sy, 3 + rand() * 3, 10 + rand() * 16);
    }
  }
  return c;
}

/** Fasadkakel per typ+variant, repeat (1,1) – UV:erna styr upprepningen. */
export function facadeTexture(kind: FacadeKind, variant: FacadeVariant = "normal"): CanvasTexture {
  const key = `fac:${kind}:${variant}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const ck = `${kind}:${variant}`;
  let canvas = facadeCanvasCache.get(ck);
  if (!canvas) {
    canvas = drawFacadeTile(kind, variant);
    facadeCanvasCache.set(ck, canvas);
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Glasfasad (curtain wall) för skyskrapor: heltäckande glaspaneler med
 * smala poster, spegling i band och enstaka tända rutor. 4×4 paneler.
 */
function drawGlassTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const rand = mulberry32(90210);
  const CELL = 64;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * CELL;
      const y = row * CELL;
      const lit = rand() < 0.10;
      if (lit) {
        g.fillStyle = "#ffe2a8";
        g.fillRect(x, y, CELL, CELL);
      } else {
        // Glas med vertikal gradient + horisontellt himmelsband
        const shade = 0.88 + rand() * 0.28;
        const grad = g.createLinearGradient(0, y, 0, y + CELL);
        grad.addColorStop(0, `rgb(${200 * shade | 0},${218 * shade | 0},${232 * shade | 0})`);
        grad.addColorStop(0.45, `rgb(${150 * shade | 0},${175 * shade | 0},${198 * shade | 0})`);
        grad.addColorStop(1, `rgb(${108 * shade | 0},${132 * shade | 0},${156 * shade | 0})`);
        g.fillStyle = grad;
        g.fillRect(x, y, CELL, CELL);
        if (rand() < 0.35) {
          g.fillStyle = "rgba(255,255,255,0.18)";
          g.fillRect(x, y + 10 + rand() * 30, CELL, 6);
        }
      }
      // Poster (mörka linjer mellan paneler)
      g.strokeStyle = "rgba(30,40,50,0.8)";
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    }
  }
  return c;
}

/** Curtain wall-textur; repeat i paneler (bredd) × våningar (höjd), /4 internt. */
export function glassTexture(repeatX: number, repeatY: number): CanvasTexture {
  const key = `glass:${repeatX}x${repeatY}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedGlassCanvas) sharedGlassCanvas = drawGlassTile();
  const tex = new CanvasTexture(sharedGlassCanvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
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

/**
 * Statusikon för kartan: emoji på en läsbar vit bricka, som CanvasTexture
 * för billboard-sprites ovanför husen (bud, vakans, till salu). Cachas.
 */
export function iconTexture(emoji: string): CanvasTexture {
  const key = `icon:${emoji}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  // Vit rund bricka med tunn mörk kant → läsbar mot alla fasader.
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,252,244,0.95)";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "rgba(60,50,40,0.8)";
  g.stroke();
  g.font = "68px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 64, 70);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
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
