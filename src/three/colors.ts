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
  owned: "#800020", // ägd (burgundy)
  lotForSale: "#4d8b52", // tomt till salu
  lotOwned: "#800020",
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

/** Subtil zonton per distrikt. */
export const DISTRICT_TINTS: Record<string, string> = {
  centrum: "#c4bfae",
  hamnen: "#b7c2c6",
  industri: "#bdbcae",
  förort: "#bcc3b0",
  kulle: "#c6beb0",
};
