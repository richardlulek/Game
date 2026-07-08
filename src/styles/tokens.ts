/* ============================================================
   Designtokens – "Modern förvaltarterminal". Mörk skiffer,
   grafitpaneler, stålblå linjer och en elektrisk indigoaccent.
   Nycklarna är oförändrade sedan art-deco-temat (wood/brass/
   felt/parchment) så att hela UI:t byter skinn härifrån.
   ============================================================ */

/** Primär åtgärdsaccent (het indigo – tidigare burgundy). */
export const BURGUNDY = "#4f63e4";

/** Hela palettens råfärger. */
export const C = {
  // Bakgrundsytor (tidigare "filt")
  feltDark: "#0d1218",
  felt: "#121924",
  feltLight: "#1a2330",

  // Paneler (tidigare "valnöt")
  wood: "#1b2532",
  woodLight: "#243244",
  woodDark: "#131b26",

  // Linjer & lyft text (tidigare "mässing")
  brass: "#54708e",
  brassBright: "#e7eef7",
  brassDim: "#31435a",

  // Ljusa kort (tidigare "pergament")
  parchment: "#f3f6fa",
  parchmentDark: "#dfe6ef",
  cream: "#eef2f7",

  // Text
  ink: "#1a2430",
  inkSoft: "#5d6b7c",
  creamText: "#dbe4ef",
  creamSoft: "#8fa0b3",

  // Accenter
  burgundy: BURGUNDY,
  burgundyBright: "#7386ff",
  green: "#1f8a70",
  greenBright: "#2fae8f",
  gold: "#e8a33d",
  positive: "#22a06b",
  positiveBright: "#3dd68c",
  negative: "#e5484d",
  negativeBright: "#ff6b70",
} as const;

/** Typsnittsfamiljer – ett modernt grotesksnitt rakt igenom. */
export const FONTS = {
  display: "'Inter', 'Segoe UI', system-ui, sans-serif",
  heading: "'Inter', 'Segoe UI', system-ui, sans-serif",
  body: "'Inter', 'Segoe UI', system-ui, sans-serif",
} as const;

/** Återanvändbara ytor/gradienter. */
export const THEME = {
  feltBg: `linear-gradient(180deg, ${C.feltLight}, ${C.feltDark})`,
  wood: `linear-gradient(180deg, ${C.woodLight}, ${C.woodDark})`,
  woodBar: `linear-gradient(180deg, #1e2938, #121a25)`,
  brassEdge: `linear-gradient(180deg, ${C.brassBright}, ${C.brass})`,
  parchment: `linear-gradient(170deg, #f7fafd, #e7edf5)`,
  goldRule: `linear-gradient(90deg, transparent, ${C.brass}, transparent)`,
  brassBorder: `1px solid ${C.brass}55`,
  brassBorder2: `1px solid ${C.brass}88`,
  panelShadow: "0 14px 36px rgba(4,8,14,0.55)",
  insetGold: `inset 0 0 0 1px ${C.brass}33`,
} as const;

/** Bakåtkompatibel semantisk färgmappning. */
export const COLORS = {
  burgundy: BURGUNDY,
  text: C.ink,
  bg: C.felt,
  positive: C.positive,
  negative: C.negative,
} as const;
