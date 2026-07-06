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

/** Fasadfärg per konkurrent (index i state.competitors). */
export const RIVAL_COLORS = ["#7a5c8f", "#46707e", "#8a6a52"];

/** Markeringsringar runt tomtrutor. */
export const RING_COLORS = {
  listing: "#e3b23c", // till salu
  owned: "#800020", // ägd (burgundy)
  lotForSale: "#4d8b52", // tomt till salu
  lotOwned: "#800020",
  rival: "#8a8f98", // konkurrentägd
  selected: "#ffffff",
} as const;

export const GROUND = "#a2a8a4";
export const PAD = "#d6d3ca";
export const SKY = "#dfe9f0";
export const WATER = "#7fa8c4";
export const CONSTRUCTION = "#c9bda2";

/** Subtil zonton per distrikt. */
export const DISTRICT_TINTS: Record<string, string> = {
  centrum: "#c4bfae",
  hamnen: "#b7c2c6",
  industri: "#bdbcae",
  förort: "#bcc3b0",
  kulle: "#c6beb0",
  storängen: "#c2c8b4",
};

/** Zonton för distrikt som ännu inte låsts upp. */
export const LOCKED_TINT = "#adb1a9";
