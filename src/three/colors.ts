/* ============================================================
   Färgpalett för 3D-vyn. Medvetet stiliserad "lådstad" –
   riktiga modeller är en senare fas (asset-pipeline).
   ============================================================ */

import type { PropTypeKey } from "../engine/types";

/** Fasadfärg per fastighetstyp. */
export const TYPE_COLORS: Record<PropTypeKey, string> = {
  bostad: "#b06a4f",
  kontor: "#5b7e9d",
  butik: "#c8973c",
  industri: "#7c8a79",
};

/** Neutrala fasader för dekorativ stadsbebyggelse (ej spelobjekt). */
export const AMBIENT_COLORS = ["#a9aeb4", "#b8bcb6", "#9fa6ac", "#c1c1b8"];

/** Fasadfärg per konkurrent (index i state.competitors, upp till 7). */
export const RIVAL_COLORS = [
  "#7a5c8f",
  "#46707e",
  "#8a6a52",
  "#5d7a4f",
  "#8f5c6e",
  "#4f6a8a",
  "#7d7550",
];

/** Markeringsringar runt tomtrutor. */
export const RING_COLORS = {
  listing: "#e3b23c", // till salu
  owned: "#4f63e4", // ägd (indigo – spelarens färg)
  lotForSale: "#4d8b52", // tomt till salu
  lotOwned: "#4f63e4",
  rival: "#8a8f98", // konkurrentägd
  selected: "#ffffff",
} as const;

export const GROUND = "#9dab90";
export const PAD = "#d6d3ca";
export const SKY = "#dfe9f0";
export const WATER = "#7fa8c4";
export const CONSTRUCTION = "#c9bda2";
export const ROAD = "#767d82";
export const ROAD_DASH = "#e8e5da";
export const TREE_TRUNK = "#7a5a3a";
export const TREE_GREENS = ["#5e7f4e", "#6f8f57", "#54754a"];
export const CAR_COLORS = ["#b6413a", "#3c6ca8", "#d9d9d9", "#3f3f3f", "#c9a13b", "#5a7f66"];

/** Markfärg per distrikt: gårdssten i stan, gräs i ytterområdena. */
export const PLOT_COLORS: Record<string, string> = {
  centrum: "#cfccc2",
  finans: "#c6c9cc",
  innerstad: "#ccc8bc",
  hamnen: "#b8b8ae",
  industri: "#a8a69a",
  förort: "#a9b892",
  kulle: "#adbb95",
};
export const PLOT_FALLBACK = "#c8c5ba";
export const PARK_GREEN = "#a9bb94";
export const SIDEWALK = "#c3c0b4";

/** Subtil zonton per distrikt. */
export const DISTRICT_TINTS: Record<string, string> = {
  centrum: "#c4bfae",
  finans: "#b4bec8",
  innerstad: "#c8c0b0",
  hamnen: "#b7c2c6",
  industri: "#bdbcae",
  förort: "#bcc3b0",
  kulle: "#c6beb0",
};

/* ── Fasadpaletter per distrikt (dekorativ bebyggelse & materialkänsla) ── */

/** Centrum: sten och puts i varma jordtoner. */
export const PALETTE_CENTRUM = ["#d9cfc0", "#cfc0a8", "#c8b9a2", "#d6c6b0", "#b9a88f", "#e2d8c6", "#c4a98c"];
/** Finansdistriktet: glas och stål i blå/grå toner. */
export const PALETTE_FINANS = ["#8fb0c8", "#7fa3c0", "#6d94b5", "#9db8cc", "#5f88a8"];
/** Innerstaden – funkisputs. */
export const PALETTE_FUNKIS = ["#e6e0d2", "#dcd6c4", "#e8e2d8", "#d8cfc0", "#efe9dc"];
/** Innerstaden – tegel. */
export const PALETTE_TEGEL = ["#9c5a44", "#8a4f3d", "#a86a50", "#7e4a3a", "#b07454"];
/** Förorten: puts i mjuka pastelljordtoner. */
export const PALETTE_FORORT = ["#c9b8a0", "#b8a888", "#d0c0a8", "#a89878", "#c0ae90"];
/** Industri: plåt och betong. */
export const PALETTE_INDUSTRI = ["#8a97a0", "#7a8a94", "#9aa8b0", "#708088", "#94a094"];
/** Hamnen: magasinsteglet och sjöbodsplåt. */
export const PALETTE_HAMN = ["#96604a", "#7a5a48", "#8a6a55", "#6d7a82", "#856048"];
/** Villakullen: träfasader. */
export const PALETTE_VILLA = ["#c8b090", "#b89878", "#d4c0a0", "#a08868", "#c0a888", "#8f4f3f"];
