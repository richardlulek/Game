/* ============================================================
   Designtokens – "Klassisk fastighetsmagnat" (art-deco, 1925).
   Mörkgrön filt, valnötspaneler, mässing/guld, pergament.
   Primärfärgen burgundy (#800020) bevaras som djup accent.
   ============================================================ */

export const BURGUNDY = "#800020";

/** Hela palettens råfärger. */
export const C = {
  // Filt (bordsyta / bakgrund)
  feltDark: "#102a22",
  felt: "#163a2d",
  feltLight: "#1f4a39",

  // Valnötspaneler
  wood: "#3a2417",
  woodLight: "#4d2f1c",
  woodDark: "#241307",

  // Mässing / guld
  brass: "#c9a45c",
  brassBright: "#eccd86",
  brassDim: "#8f7338",

  // Pergament / gräddvitt
  parchment: "#f3ead3",
  parchmentDark: "#e4d4b0",
  cream: "#efe6d0",

  // Text
  ink: "#2c1f12",
  inkSoft: "#5e4c34",
  creamText: "#f0e6cc",
  creamSoft: "#c3b290",

  // Accenter
  burgundy: BURGUNDY,
  burgundyBright: "#a8243f",
  green: "#2f6b4a",
  greenBright: "#439061",
  gold: "#d4af37",
  positive: "#2f7d3f",
  positiveBright: "#5aa86a",
  negative: "#a83246",
  negativeBright: "#cf5a6a",
} as const;

/** Typsnittsfamiljer. */
export const FONTS = {
  /** Monumentala graverade versaler – logo & titlar. */
  display: "'Cinzel', Georgia, serif",
  /** Eleganta rubriker & nyckeltal. */
  heading: "'Playfair Display', Georgia, serif",
  /** Geometrisk deco-era sans – brödtext, UI, siffror. */
  body: "'Jost', 'Century Gothic', system-ui, sans-serif",
} as const;

/** Återanvändbara ytor/gradienter. */
export const THEME = {
  feltBg: `radial-gradient(ellipse 120% 80% at 50% -10%, ${C.feltLight}, ${C.feltDark} 75%)`,
  wood: `linear-gradient(158deg, ${C.woodLight}, ${C.woodDark})`,
  woodBar: `linear-gradient(180deg, #43291a, #241307)`,
  brassEdge: `linear-gradient(180deg, ${C.brassBright}, ${C.brassDim})`,
  parchment: `linear-gradient(165deg, #f6efdc, #e6d6b4)`,
  goldRule: `linear-gradient(90deg, transparent, ${C.brass}, transparent)`,
  brassBorder: `1px solid ${C.brass}`,
  brassBorder2: `2px solid ${C.brass}`,
  panelShadow: "0 10px 30px rgba(0,0,0,0.45)",
  insetGold: `inset 0 0 0 1px ${C.brass}66`,
} as const;

/** Bakåtkompatibel semantisk färgmappning. */
export const COLORS = {
  burgundy: BURGUNDY,
  text: C.ink,
  bg: C.felt,
  positive: C.positive,
  negative: C.negative,
} as const;
