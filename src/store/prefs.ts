/* ============================================================
   Spelarinställningar som inte hör till en enskild sparfil –
   autospar och reducerad rörelse. Lagras i localStorage och läses
   av inställningsmenyn samt spel-loopen. Robust mot privatläge där
   localStorage kan kasta.
   ============================================================ */

const AUTOSAVE_KEY = "fastighetsimperium:autosave";
const REDUCE_MOTION_KEY = "fastighetsimperium:reduceMotion";
const SHOW_FPS_KEY = "fastighetsimperium:showFps";

/** Autospar till aktiv slot vid varje månadsskifte. Standard: på. */
export function getAutosave(): boolean {
  try { return localStorage.getItem(AUTOSAVE_KEY) !== "off"; }
  catch { return true; }
}

export function setAutosave(on: boolean): void {
  try { localStorage.setItem(AUTOSAVE_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

/** Hoppa över berättelsens kamerapauser och korta ned svep. Standard: av. */
export function getReduceMotion(): boolean {
  try { return localStorage.getItem(REDUCE_MOTION_KEY) === "on"; }
  catch { return false; }
}

export function setReduceMotion(on: boolean): void {
  try { localStorage.setItem(REDUCE_MOTION_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

/** Visa FPS-mätaren (nere till höger). Standard: av. */
export function getShowFps(): boolean {
  try { return localStorage.getItem(SHOW_FPS_KEY) === "on"; }
  catch { return false; }
}

export function setShowFps(on: boolean): void {
  try { localStorage.setItem(SHOW_FPS_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

/* ── Grafikkvalitet ─────────────────────────────────────────────────────
   Låter spelaren anpassa efter sin maskin. Reglagen som ger mest på svaga
   (integrerade) GPU:er: renderupplösning (dpr), skuggor och avstånds-LOD. */
const GRAPHICS_KEY = "fastighetsimperium:graphics";
export type Quality = "low" | "medium" | "high";

export interface GraphicsPreset {
  /** Renderupplösning – störst effekt på fillrate-svaga iGPU:er. */
  dpr: number;
  /** Skuggpass (dyrt: extra geometrigenomgång). */
  shadows: boolean;
  /** Skuggkartans upplösning. */
  shadowMap: number;
  /** Levande stad: trafik, fotgängare, fåglar, moln. */
  ambient: boolean;
  /** Keep a small moving population even on integrated GPUs. */
  population: number;
  /** Avstånd där husen blir instansierade block (lägre = mer aggressivt). */
  lodEnter: number;
  lodExit: number;
}

// Detail LOD retains the original textured building silhouettes. Only small
// roof/entrance objects and badges disappear; the old untextured blocks are
// deliberately not used. Hysteresis prevents flicker at the threshold.
export const GRAPHICS_PRESETS: Record<Quality, GraphicsPreset> = {
  low:    { dpr: 1,    shadows: false, shadowMap: 0,    ambient: false, population: 0.25, lodEnter: 320, lodExit: 280 },
  medium: { dpr: 1.35, shadows: true,  shadowMap: 1024, ambient: true, population: 0.6, lodEnter: 480, lodExit: 430 },
  high:   { dpr: 1.75, shadows: true, shadowMap: 2048, ambient: true, population: 1, lodEnter: 650, lodExit: 590 },
};

export function getGraphics(): Quality {
  try {
    const v = localStorage.getItem(GRAPHICS_KEY);
    return v === "low" || v === "medium" || v === "high" ? v : "high";
  } catch { return "high"; }
}

export function setGraphics(q: Quality): void {
  try { localStorage.setItem(GRAPHICS_KEY, q); } catch { /* ignore */ }
}
