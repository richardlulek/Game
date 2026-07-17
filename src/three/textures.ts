/* ============================================================
   Procedurella texturer – ritas på canvas och delas av alla
   byggnader/marken. Ingen extern asset-pipeline behövs;
   materialets color-tint ger varje hus sin fasadfärg.
   ============================================================ */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/** Kakelpar: färgkakel + emissivt tvillingkakel (svart utom tända fönster).
 *  Emissivkaklet används som emissiveMap så tänt verkligen GLÖDER i stället
 *  för att bara vara en ljus färg som tintas ner av materialet. */
interface TilePair { color: HTMLCanvasElement; emissive: HTMLCanvasElement }

/** Skapar ett 2×-skalat canvas-par i 256-rummet (512 px verkligt). */
function makeTilePair(width = 256, height = 256): { pair: TilePair; g: CanvasRenderingContext2D; e: CanvasRenderingContext2D } {
  const color = document.createElement("canvas");
  color.width = width * 2;
  color.height = height * 2;
  const g = color.getContext("2d")!;
  g.scale(2, 2);
  const emissive = document.createElement("canvas");
  emissive.width = width * 2;
  emissive.height = height * 2;
  const e = emissive.getContext("2d")!;
  e.scale(2, 2);
  e.fillStyle = "#000000";
  e.fillRect(0, 0, width, height);
  return { pair: { color, emissive }, g, e };
}

let sharedWindowPair: TilePair | null = null;
let sharedGlassPair: TilePair | null = null;
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
function drawWindowTile(): TilePair {
  const { pair, g, e } = makeTilePair();
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
        e.fillStyle = "#ffd9a0";
        e.fillRect(x + 17, y + 19, 30, 28);
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
      e.fillStyle = "#000000"; // posten mörk även i glödkaklet
      e.fillRect(x + 30, y + 19, 3, 28);
      // Bjälklagsskugga nederst på våningen
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, y + 58, CELL, 6);
    }
  }
  return pair;
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
  if (!sharedWindowPair) sharedWindowPair = drawWindowTile();
  const tex = new CanvasTexture(sharedWindowPair.color);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Emissiv tvilling till windowTexture – svart utom de tända fönstren. */
export function windowEmissiveTexture(repeatX: number, repeatY: number): CanvasTexture {
  const key = `wine:${repeatX}x${repeatY}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedWindowPair) sharedWindowPair = drawWindowTile();
  const tex = new CanvasTexture(sharedWindowPair.emissive);
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

const facadeCanvasCache = new Map<string, TilePair>();

/** Andel tända fönster per variant (multipliceras per typ). */
const LIT_SHARE: Record<FacadeVariant, number> = {
  normal: 1,
  tänt: 2.6,
  släckt: 0,
  sliten: 0.5,
};

const CURTAIN_COLORS = ["#e8ddc8", "#d8c8b8", "#e2d4d0", "#ccd4c8"];
const SIGN_COLORS = ["#b6413a", "#3c6ca8", "#c9a13b", "#4d8b52", "#7a5c8f"];

/** Fejkad AO i en fönsternisch: mörk kant upptill och till vänster ger
 *  djupintryck utan geometri. Anropas efter att glaset ritats. */
function windowRecess(g: CanvasRenderingContext2D, wx: number, wy: number, ww: number, wh: number) {
  const top = g.createLinearGradient(0, wy, 0, wy + 6);
  top.addColorStop(0, "rgba(0,0,0,0.30)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = top;
  g.fillRect(wx, wy, ww, 6);
  g.fillStyle = "rgba(0,0,0,0.10)";
  g.fillRect(wx, wy, 3, wh);
}

/** Bjälklagsskugga som gradient – mjukare än en platt rektangel. */
function slabShadow(g: CanvasRenderingContext2D, x: number, y: number) {
  const slab = g.createLinearGradient(0, y + 51, 0, y + 64);
  slab.addColorStop(0, "rgba(0,0,0,0)");
  slab.addColorStop(1, "rgba(0,0,0,0.17)");
  g.fillStyle = slab;
  g.fillRect(x, y + 51, 64, 13);
}

function drawFacadeTile(kind: FacadeKind, variant: FacadeVariant): TilePair {
  const { pair, g, e } = makeTilePair();
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
        // Radindex ger våningsvariation: jämna våningar har högre fönster
        // med markerat bleck, udda lägre – fasaden får rytm i höjdled.
        const door = rand() < 0.2;
        const french = !door && rand() < 0.12; // fransk balkong
        const tallRow = row % 2 === 0;
        const wx = x + (door ? 20 : 14);
        const wy = y + (door ? 10 : tallRow ? 14 : 18);
        const ww = door ? 24 : 36;
        const wh = door ? 46 : tallRow ? 37 : 31;
        g.fillStyle = "#4a4a44";
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        if (lit(0.16)) {
          const warm = g.createLinearGradient(0, wy, 0, wy + wh);
          warm.addColorStop(0, "#ffe3ae");
          warm.addColorStop(1, "#e8b45f");
          g.fillStyle = warm;
          g.fillRect(wx, wy, ww, wh);
          e.fillStyle = "#ffd9a0";
          e.fillRect(wx, wy, ww, wh);
        } else {
          g.fillStyle = `rgb(${120 + rand() * 40 | 0},${130 + rand() * 40 | 0},${140 + rand() * 40 | 0})`;
          g.fillRect(wx, wy, ww, wh);
        }
        // Gardiner i sidorna – dämpar även glöden
        if (!door && rand() < 0.65) {
          g.fillStyle = CURTAIN_COLORS[(rand() * CURTAIN_COLORS.length) | 0];
          g.fillRect(wx, wy, 6, wh);
          g.fillRect(wx + ww - 6, wy, 6, wh);
          e.fillStyle = "rgba(0,0,0,0.6)";
          e.fillRect(wx, wy, 6, wh);
          e.fillRect(wx + ww - 6, wy, 6, wh);
        }
        windowRecess(g, wx, wy, ww, wh);
        // Fönsterbleck – ljus kant under öppningen
        if (!door) {
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(wx - 2, wy + wh + 3, ww + 4, 2);
        }
        // Blomlåda på somliga bleck
        if (!door && !french && rand() < 0.13) {
          g.fillStyle = "#7a5c46";
          g.fillRect(wx + 4, wy + wh + 4, ww - 8, 5);
          g.fillStyle = "#5e7f3e";
          for (let f = 0; f < 5; f++) g.fillRect(wx + 5 + (f * (ww - 10)) / 5, wy + wh + 2, 4, 3);
        }
        // Fransk balkong: smäckert räcke framför fönstrets nederdel
        if (french) {
          g.fillStyle = "rgba(60,60,58,0.85)";
          g.fillRect(wx - 2, wy + wh - 12, ww + 4, 2);
          for (let b = 0; b <= 8; b++) g.fillRect(wx - 2 + (b * (ww + 4)) / 8, wy + wh - 12, 1.5, 12);
        }
        // Balkongräcke framför dörren
        if (door) {
          g.fillStyle = "rgba(60,60,58,0.85)";
          g.fillRect(x + 12, y + 38, 40, 3);
          for (let b = 0; b < 6; b++) g.fillRect(x + 14 + b * 7, y + 38, 2, 16);
        }
      } else if (kind === "kontor") {
        // Brett kontorsband med persienner; kallt ljus. Bröstningsband i
        // växlande ton per våning ger horisontell rytm.
        g.fillStyle = row % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
        g.fillRect(x, y + 50, CELL, 8);
        const wx = x + 8;
        const wy = y + 18;
        g.fillStyle = "#3e454c";
        g.fillRect(wx - 2, wy - 2, 52, 32);
        if (lit(0.12)) {
          g.fillStyle = "#e8f0f8";
          g.fillRect(wx, wy, 48, 28);
          e.fillStyle = "#cfe0ec"; // kontor lyser kallvitt
          e.fillRect(wx, wy, 48, 28);
          // Takarmaturer – två ljusa band i taket på tända kontor
          g.fillStyle = "rgba(255,255,255,0.85)";
          g.fillRect(wx + 4, wy + 3, 17, 2.5);
          g.fillRect(wx + 27, wy + 3, 17, 2.5);
          e.fillStyle = "#ffffff";
          e.fillRect(wx + 4, wy + 3, 17, 2.5);
          e.fillRect(wx + 27, wy + 3, 17, 2.5);
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
        // Persienner halvt nerdragna i hälften av cellerna – skymmer glöden
        if (rand() < 0.5) {
          const drop = 8 + rand() * 14;
          g.fillStyle = "rgba(226,222,208,0.92)";
          g.fillRect(wx, wy, 48, drop);
          e.fillStyle = "rgba(0,0,0,0.85)";
          e.fillRect(wx, wy, 48, drop);
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
        windowRecess(g, wx, wy, 48, 28);
      } else if (kind === "butik") {
        // Stora skyltfönster med varmt skyltljus och skyltband.
        // Somliga celler är glasdörrar med handtag – entréer i bandet.
        const isDoor = rand() < 0.15;
        const wx = x + 6;
        const wy = y + 14;
        g.fillStyle = "#2e3338";
        g.fillRect(wx - 2, wy - 2, 56, 42);
        if (isDoor) {
          // Glasdörr: två dörrblad, varmt ljus innanför, handtag
          const glow = g.createLinearGradient(0, wy, 0, wy + 38);
          glow.addColorStop(0, "#f4e2b8");
          glow.addColorStop(1, "#d8b878");
          g.fillStyle = glow;
          g.fillRect(wx + 12, wy, 28, 38);
          e.fillStyle = "#e8cd94";
          e.fillRect(wx + 12, wy, 28, 38);
          g.fillStyle = "#2e3338";
          g.fillRect(wx + 25, wy, 2, 38); // dörrpost
          e.fillStyle = "#000000";
          e.fillRect(wx + 25, wy, 2, 38);
          g.fillStyle = "rgba(40,40,36,0.9)";
          g.fillRect(wx + 21, wy + 18, 2, 8); // handtag
          g.fillRect(wx + 29, wy + 18, 2, 8);
          // Sidopaneler i mörkt glas
          g.fillStyle = `rgb(${96 + rand() * 20 | 0},${104 + rand() * 20 | 0},${112 + rand() * 20 | 0})`;
          g.fillRect(wx, wy, 12, 38);
          g.fillRect(wx + 40, wy, 12, 38);
        } else if (lit(0.3)) {
          const glow = g.createLinearGradient(0, wy, 0, wy + 38);
          glow.addColorStop(0, "#ffedc2");
          glow.addColorStop(1, "#e8c47f");
          g.fillStyle = glow;
          g.fillRect(wx, wy, 52, 38);
          e.fillStyle = "#f4d698";
          e.fillRect(wx, wy, 52, 38);
          // Silhuetter av varor i fönstret – mörka även i glöden
          const goods: [number, number, number, number][] = [
            [wx + 6 + rand() * 8, wy + 20, 8, 18],
            [wx + 28 + rand() * 8, wy + 24, 10, 14],
            [wx + 18 + rand() * 6, wy + 26, 6, 12],
          ];
          for (const [gx, gy, gw, gh] of goods) {
            g.fillStyle = "rgba(90,70,50,0.55)";
            g.fillRect(gx, gy, gw, gh);
            e.fillStyle = "rgba(0,0,0,0.55)";
            e.fillRect(gx, gy, gw, gh);
          }
        } else {
          g.fillStyle = `rgb(${110 + rand() * 30 | 0},${118 + rand() * 30 | 0},${126 + rand() * 30 | 0})`;
          g.fillRect(wx, wy, 52, 38);
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.fillRect(wx, wy + 4, 52, 6);
        }
        // Sockelplåt under skyltfönstret
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(wx - 2, wy + 36, 56, 4);
        windowRecess(g, wx, wy, 52, 38);
        // Skyltband ovanför fönstret
        if (rand() < 0.6) {
          g.fillStyle = SIGN_COLORS[(rand() * SIGN_COLORS.length) | 0];
          g.fillRect(wx, y + 4, 52, 8);
          g.fillStyle = "rgba(255,255,255,0.25)";
          g.fillRect(wx, y + 4, 52, 2);
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
          e.fillStyle = "#e0d29c";
          e.fillRect(x + 8, y + 10, 48, 10);
        } else {
          g.fillStyle = `rgb(${128 + rand() * 26 | 0},${136 + rand() * 26 | 0},${142 + rand() * 26 | 0})`;
          g.fillRect(x + 8, y + 10, 48, 10);
        }
        g.fillStyle = "rgba(0,0,0,0.18)";
        for (let p = 0; p < 5; p++) g.fillRect(x + 10 + p * 10, y + 10, 2, 10);
        windowRecess(g, x + 8, y + 10, 48, 10);
        // Ventil/lucka
        if (rand() < 0.3) {
          g.fillStyle = "#6a7076";
          g.fillRect(x + 40, y + 38, 14, 14);
          g.fillStyle = "rgba(0,0,0,0.3)";
          for (let v = 0; v < 3; v++) g.fillRect(x + 42, y + 41 + v * 4, 10, 2);
        }
      }

      // Bjälklagsskugga
      slabShadow(g, x, y);
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

  // Garanterat svart emissiv texel där fasadboxens topp/botten-UV pekar
  // (solid-punkten [0.123, 0.87] i facadeBoxGeometry) – annars kan tak
  // börja glöda om cell (0,0) råkar vara tänd.
  e.fillStyle = "#000000";
  e.fillRect(28, 29, 8, 8);
  return pair;
}

function facadePair(kind: FacadeKind, variant: FacadeVariant): TilePair {
  const ck = `${kind}:${variant}`;
  let p = facadeCanvasCache.get(ck);
  if (!p) {
    p = drawFacadeTile(kind, variant);
    facadeCanvasCache.set(ck, p);
  }
  return p;
}

/** Fasadkakel per typ+variant, repeat (1,1) – UV:erna styr upprepningen. */
export function facadeTexture(kind: FacadeKind, variant: FacadeVariant = "normal"): CanvasTexture {
  const key = `fac:${kind}:${variant}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const tex = new CanvasTexture(facadePair(kind, variant).color);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Emissiv tvilling till facadeTexture – svart utom tända fönster/skyltar. */
export function facadeEmissiveTexture(kind: FacadeKind, variant: FacadeVariant = "normal"): CanvasTexture {
  const key = `face:${kind}:${variant}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const tex = new CanvasTexture(facadePair(kind, variant).emissive);
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
function drawGlassTile(): TilePair {
  const { pair, g, e } = makeTilePair();
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
        e.fillStyle = "#f0d090";
        e.fillRect(x, y, CELL, CELL);
        // Interiörsilhuett: bjälklag + pelare skymtar i tända paneler
        const px = x + 18 + rand() * 24;
        g.fillStyle = "rgba(120,90,40,0.25)";
        g.fillRect(x, y + CELL - 8, CELL, 8);
        g.fillRect(px, y + 12, 5, CELL - 12);
        e.fillStyle = "rgba(0,0,0,0.35)";
        e.fillRect(x, y + CELL - 8, CELL, 8);
        e.fillRect(px, y + 12, 5, CELL - 12);
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
      // Fejkad AO: panelen sitter bakom posterna – mörk kant upptill
      const recess = g.createLinearGradient(0, y, 0, y + 5);
      recess.addColorStop(0, "rgba(0,10,20,0.30)");
      recess.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = recess;
      g.fillRect(x, y, CELL, 5);
      // Poster (mörka linjer mellan paneler) – ramar in även glöden
      g.strokeStyle = "rgba(30,40,50,0.8)";
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      e.strokeStyle = "#000000";
      e.lineWidth = 3;
      e.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
    }
  }
  // Svart texel vid tornens takdäcks-UV ([0.5, 0.965]) – se facadeTile.
  e.fillStyle = "#000000";
  e.fillRect(124, 5, 8, 8);
  return pair;
}

/** Curtain wall-textur; repeat i paneler (bredd) × våningar (höjd), /4 internt. */
export function glassTexture(repeatX: number, repeatY: number): CanvasTexture {
  const key = `glass:${repeatX}x${repeatY}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedGlassPair) sharedGlassPair = drawGlassTile();
  const tex = new CanvasTexture(sharedGlassPair.color);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Emissiv tvilling till glassTexture – tända paneler i tornen glöder. */
export function glassEmissiveTexture(repeatX: number, repeatY: number): CanvasTexture {
  const key = `glasse:${repeatX}x${repeatY}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedGlassPair) sharedGlassPair = drawGlassTile();
  const tex = new CanvasTexture(sharedGlassPair.emissive);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX / 4, repeatY / 4);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/* ============================================================
   Skyltfönsterglas för butiksbanden i bottenplan: en våning hög
   remsa med stora glaspartier, varmt butiksljus, varusilhuetter
   och en och annan glasdörr – i stället för en platt mörk låda.
   ============================================================ */

let sharedStorefrontPair: TilePair | null = null;

function drawStorefrontTile(): TilePair {
  const { pair, g, e } = makeTilePair(256, 64); // 4 sektioner à 64 px
  const rand = mulberry32(2468);
  const CELL = 64;
  for (let s = 0; s < 4; s++) {
    const x = s * CELL;
    // Mörk ram/pilaster mellan sektionerna
    g.fillStyle = "#2e3338";
    g.fillRect(x, 0, CELL, 64);
    const isDoor = s === 2; // en entré per kakel
    const wx = x + 5;
    if (isDoor) {
      // Glasdörr med varmt ljus + sidofönster
      g.fillStyle = `rgb(${100 + rand() * 20 | 0},${108 + rand() * 20 | 0},${116 + rand() * 20 | 0})`;
      g.fillRect(wx, 8, 14, 50);
      g.fillRect(x + 45, 8, 14, 50);
      const glow = g.createLinearGradient(0, 8, 0, 58);
      glow.addColorStop(0, "#f4e2b8");
      glow.addColorStop(1, "#d8b878");
      g.fillStyle = glow;
      g.fillRect(x + 21, 8, 22, 50);
      e.fillStyle = "#e0c68e";
      e.fillRect(x + 21, 8, 22, 50);
      g.fillStyle = "#2e3338";
      g.fillRect(x + 31, 8, 2, 50); // dörrpost
      e.fillStyle = "#000000";
      e.fillRect(x + 31, 8, 2, 50);
      g.fillStyle = "rgba(40,40,36,0.9)";
      g.fillRect(x + 27, 30, 2, 10); // handtag
      g.fillRect(x + 35, 30, 2, 10);
    } else {
      // Skyltfönster: varmt ljus med varusilhuetter, eller släckt glas
      const litWin = rand() < 0.7;
      if (litWin) {
        const glow = g.createLinearGradient(0, 8, 0, 58);
        glow.addColorStop(0, "#ffedc2");
        glow.addColorStop(1, "#e0bc72");
        g.fillStyle = glow;
        g.fillRect(wx, 8, 54, 50);
        e.fillStyle = "#f0d494";
        e.fillRect(wx, 8, 54, 50);
        const goods: [number, number, number, number][] = [
          [wx + 6 + rand() * 6, 30, 9, 24],
          [wx + 24 + rand() * 6, 36, 11, 18],
          [wx + 40 + rand() * 4, 32, 7, 22],
        ];
        for (const [gx, gy, gw, gh] of goods) {
          g.fillStyle = "rgba(90,70,50,0.55)";
          g.fillRect(gx, gy, gw, gh);
          e.fillStyle = "rgba(0,0,0,0.55)";
          e.fillRect(gx, gy, gw, gh);
        }
      } else {
        g.fillStyle = `rgb(${112 + rand() * 26 | 0},${120 + rand() * 26 | 0},${128 + rand() * 26 | 0})`;
        g.fillRect(wx, 8, 54, 50);
        g.fillStyle = "rgba(255,255,255,0.14)";
        g.fillRect(wx, 14, 54, 7);
      }
      // Mittpost i breda partier
      g.fillStyle = "#2e3338";
      g.fillRect(x + 31, 8, 2, 50);
      e.fillStyle = "#000000";
      e.fillRect(x + 31, 8, 2, 50);
    }
    // Fejkad AO under taklisten + sockelplåt nederst
    const recess = g.createLinearGradient(0, 8, 0, 15);
    recess.addColorStop(0, "rgba(0,0,0,0.32)");
    recess.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = recess;
    g.fillRect(wx, 8, 54, 7);
    g.fillStyle = "rgba(10,12,14,0.85)";
    g.fillRect(x, 58, CELL, 6);
    e.fillStyle = "rgba(0,0,0,0.85)";
    e.fillRect(x, 58, CELL, 6);
  }
  return pair;
}

/**
 * Skyltfönstertextur för ett butiksband av given bredd (världsenheter).
 * En sektion är ~4 enheter bred; kaklet innehåller 4 sektioner så
 * repeat = bredd/16. Cachas per sektionsantal.
 */
export function storefrontTexture(width: number): CanvasTexture {
  const sections = Math.max(2, Math.round(width / 4));
  const key = `store:${sections}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedStorefrontPair) sharedStorefrontPair = drawStorefrontTile();
  const tex = new CanvasTexture(sharedStorefrontPair.color);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(sections / 4, 1);
  tex.colorSpace = SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

/** Emissiv tvilling till storefrontTexture – skyltfönstren glöder varmt. */
export function storefrontEmissiveTexture(width: number): CanvasTexture {
  const sections = Math.max(2, Math.round(width / 4));
  const key = `storee:${sections}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  if (!sharedStorefrontPair) sharedStorefrontPair = drawStorefrontTile();
  const tex = new CanvasTexture(sharedStorefrontPair.emissive);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(sections / 4, 1);
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
export function iconTexture(emoji: string, bg = "rgba(255,252,244,0.95)"): CanvasTexture {
  const key = `icon:${emoji}:${bg}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const g = c.getContext("2d")!;
  const cx = 80;
  // Färgad ytterring (kategorifärg) + mörk kant …
  g.beginPath();
  g.arc(cx, cx, 74, 0, Math.PI * 2);
  g.fillStyle = bg;
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "rgba(45,35,25,0.9)";
  g.stroke();
  // … med en vit innerskiva så själva ikonen ALLTID har kontrast (t.ex. en
  // gul prislapp mot en guldbricka blev annars oläslig).
  g.beginPath();
  g.arc(cx, cx, 55, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,253,247,0.98)";
  g.fill();
  // Stor ikon som fyller innerskivan.
  g.font = "88px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, cx, cx + 7);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
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
