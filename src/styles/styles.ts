/* ============================================================
   Inline-stilobjektet (S) – art-deco-tema "fastighetsmagnat".
   Mörkgrön filt, valnöt, mässing och pergament.
   ============================================================ */

import type { CSSProperties } from "react";
import { BURGUNDY, C, FONTS, THEME } from "./tokens";

export const S: Record<string, CSSProperties> = {
  app: {
    fontFamily: FONTS.body,
    // 100 % av #root (inte 100vh): #root bär safe-area-padding för
    // hemskärms-PWA:n, och 100vh skulle skjuta ut botten under skärmkanten.
    minHeight: "100%",
    color: C.creamText,
    background: THEME.feltBg,
  },

  // ── Rubriker ─────────────────────────────────────────────────
  // h3: ljus rubrik för MÖRK panelbakgrund.
  h3: {
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: 700,
    margin: "0 0 12px",
    color: C.brassBright,
    letterSpacing: 0.3,
  },
  // h3OnLight: samma rubrik men mörk accent – för LJUSA pergamentkort
  // (annars blir den ljusa h3-texten nästan osynlig mot ljus bakgrund).
  h3OnLight: {
    fontFamily: FONTS.heading,
    fontSize: 17,
    fontWeight: 700,
    margin: "0 0 12px",
    color: BURGUNDY,
    letterSpacing: 0.3,
  },

  // ── Korten (pergament/lagfart) ───────────────────────────────
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))",
    gap: 16,
  },
  card: {
    background: THEME.parchment,
    border: `1px solid ${C.brass}`,
    borderRadius: 6,
    padding: 16,
    color: C.ink,
    boxShadow: `${THEME.insetGold}, 0 6px 18px rgba(0,0,0,0.35)`,
  },
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: {
    background: BURGUNDY,
    color: C.brassBright,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    padding: "3px 9px",
    borderRadius: 3,
    border: `1px solid ${C.brass}99`,
  },
  cardDistrict: { fontSize: 12, color: C.inkSoft, fontWeight: 600, fontFamily: FONTS.heading },
  cardValue: { fontSize: 24, fontWeight: 800, marginBottom: 10, color: C.ink, fontFamily: FONTS.heading },
  cardRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    padding: "3px 0",
    color: C.inkSoft,
  },

  // ── Skickmätare ──────────────────────────────────────────────
  condBar: {
    position: "relative",
    width: 90,
    height: 16,
    background: C.parchmentDark,
    borderRadius: 3,
    overflow: "hidden",
    display: "inline-block",
    border: `1px solid ${C.brassDim}`,
  },
  condFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  condText: {
    position: "absolute",
    right: 6,
    top: 0,
    fontSize: 11,
    fontStyle: "normal",
    fontWeight: 700,
    color: "#fff",
    // Skugga så siffran syns både på det fyllda stapelfältet och på den
    // ljusa restbanan när tillståndet är lågt (kort fyllnad).
    textShadow: "0 0 3px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)",
    lineHeight: "16px",
  },

  // ── Knappar ──────────────────────────────────────────────────
  buyBtn: {
    width: "100%",
    marginTop: 12,
    background: BURGUNDY,
    color: C.brassBright,
    border: `1px solid ${C.brass}`,
    padding: "10px",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 14,
    fontFamily: FONTS.body,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  sellBtn: {
    width: "100%",
    marginTop: 12,
    background: "transparent",
    border: `1px solid ${C.brassDim}`,
    color: C.ink,
    padding: "9px",
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnDisabled: { background: C.brassDim, color: C.creamSoft, borderColor: C.brassDim, cursor: "default", opacity: 0.7 },
  smallBtn: {
    background: C.wood,
    border: `1px solid ${C.brass}`,
    color: C.creamText,
    padding: "7px 13px",
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  select: {
    width: "100%",
    marginTop: 8,
    padding: "8px",
    borderRadius: 4,
    border: `1px solid ${C.brassDim}`,
    background: C.cream,
    color: C.ink,
    fontSize: 13,
    fontFamily: FONTS.body,
  },

  // ── Marknadslist ─────────────────────────────────────────────
  marketBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    fontWeight: 700,
    fontSize: 15,
    color: C.brassBright,
    fontFamily: FONTS.heading,
  },
  empty: {
    gridColumn: "1/-1",
    textAlign: "center",
    color: C.creamSoft,
    padding: 40,
    background: "rgba(0,0,0,0.18)",
    borderRadius: 6,
    border: `1px dashed ${C.brassDim}`,
  },

  // ── Logg ─────────────────────────────────────────────────────
  logBox: {
    background: "rgba(0,0,0,0.22)",
    border: `1px solid ${C.brassDim}`,
    borderRadius: 6,
    padding: 16,
    maxHeight: 520,
    overflowY: "auto",
  },
  logItem: { fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.brassDim}44`, color: C.creamText },

  // ── Finans ───────────────────────────────────────────────────
  financeWrap: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  financeCol: {
    background: THEME.parchment,
    border: `1px solid ${C.brass}`,
    borderRadius: 6,
    padding: 18,
    color: C.ink,
    boxShadow: THEME.insetGold,
  },
  amortRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 8 },
  amortBtn: {
    width: "100%",
    marginTop: 10,
    background: BURGUNDY,
    color: C.brassBright,
    border: `1px solid ${C.brass}`,
    padding: "10px",
    borderRadius: 4,
    fontWeight: 700,
    cursor: "pointer",
  },

  // ── Toolbar (valnötslist med mässingskant) ───────────────────
  toolbar: {
    display: "flex",
    alignItems: "center",
    height: 52,
    background: THEME.woodBar,
    borderBottom: `2px solid ${C.brass}`,
    padding: "0 16px",
    gap: 9,
    flexShrink: 0,
    boxShadow: "0 3px 12px rgba(0,0,0,0.4)",
  },
  toolbarLogo: {
    fontFamily: FONTS.display,
    fontSize: 17,
    fontWeight: 900,
    color: C.brassBright,
    letterSpacing: 1.5,
    marginRight: 6,
    textShadow: "0 1px 2px rgba(0,0,0,0.6)",
  },
  toolbarDate: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    color: C.creamSoft,
    fontWeight: 600,
    minWidth: 54,
    whiteSpace: "nowrap",
  },
  toolbarNextBtn: {
    background: BURGUNDY,
    color: C.brassBright,
    border: `1px solid ${C.brass}`,
    padding: "7px 16px",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  toolbarFwdBtn: {
    background: "#101722",
    color: C.brass,
    border: `1px solid ${C.brassDim}`,
    padding: "5px 11px",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  toolbarMiniBtn: {
    background: "transparent",
    color: C.creamSoft,
    border: `1px solid ${C.brassDim}`,
    padding: "5px 10px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  toolbarWarn: {
    background: BURGUNDY,
    color: C.brassBright,
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 9px",
    borderRadius: 10,
    border: `1px solid ${C.brass}`,
  },

  // ── Statusfält ───────────────────────────────────────────────
  statusBar: {
    display: "flex",
    alignItems: "center",
    height: 40,
    background: THEME.woodBar,
    borderTop: `2px solid ${C.brass}`,
    padding: "0 14px",
    gap: 0,
    flexShrink: 0,
    overflowX: "auto",
  },
  statusChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 14px",
    borderRight: `1px solid ${C.brassDim}55`,
    flexShrink: 0,          // krymp inte – låt raden scrolla i stället för att bryta
    whiteSpace: "nowrap",
  },
  statusLabel: {
    fontSize: 9,
    color: C.brassDim,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  statusValue: {
    fontSize: 13,
    fontWeight: 700,
    color: C.creamText,
    fontFamily: FONTS.heading,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },

  // ── Layout ───────────────────────────────────────────────────
  appLayout: {
    display: "flex",
    flexDirection: "column",
    // Se kommentaren vid S.app: 100 % av #root i stället för 100vh så att
    // safe-area-paddingen inte trycker ut nedersta raden under skärmkanten.
    height: "100%",
    overflow: "hidden",
    background: THEME.feltBg,
    color: C.creamText,
    fontFamily: FONTS.body,
  },

  // ── Tabeller (kvar för ev. bruk) ─────────────────────────────
  tableHead: {
    display: "flex",
    padding: "6px 12px",
    background: C.wood,
    borderBottom: `1px solid ${C.brass}`,
    fontSize: 11,
    fontWeight: 700,
    color: C.brass,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    position: "sticky",
    top: 0,
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    padding: "7px 12px",
    borderBottom: `1px solid ${C.brassDim}44`,
    fontSize: 12,
    cursor: "pointer",
    gap: 4,
  },
  miniActionBtn: {
    border: `1px solid ${C.brass}`,
    color: C.creamText,
    background: BURGUNDY,
    padding: "3px 10px",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
  },
};
