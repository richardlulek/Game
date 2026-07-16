/* Kampanj-HUD för berättelseläget "Arvet efter morfar": visar aktuellt
   kapitel och dess mål som en pergamentremsa överst på kartan. Döljs
   när kampanjen är fullbordad (spelet fortsätter fritt). */

import { useState } from "react";
import { MEMORY_NOTES, STORY_BEATS, beatById, beatIndex, foundNotes } from "../engine/story";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

export function StoryHud() {
  const story = useGameStore((s) => s.state.story);
  const state = useGameStore((s) => s.state);
  const cinematic = useUiStore((s) => s.cinematic);
  const [collapsed, setCollapsed] = useState(false);

  if (!story || story.done) return null;
  // Regipaus: panelen skulle skymma scenen kameran visar – göm den.
  if (cinematic) return null;
  const beat = beatById(story.beat);
  if (!beat) return null;
  const idx = beatIndex(beat.id);

  return (
    <div style={wrap}>
      <div style={head} onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Show goals" : "Collapse"}>
        <span style={chapterNo}>KAPITEL {beat.chapter} AV {STORY_BEATS.length - 1}</span>
        <span style={chapterTitle}>📜 {beat.title}</span>
        <span style={{ marginLeft: "auto", color: C.brassDim, fontSize: 11 }}>{collapsed ? "▼" : "▲"}</span>
      </div>
      {!collapsed && (
        <>
          {beat.objectives.map((o, i) => {
            const done = o.check(state);
            return (
              <div key={i} style={{ ...objRow, opacity: done ? 0.55 : 1 }}>
                <span style={{ color: done ? "#4d8b52" : BURGUNDY, fontWeight: 800, width: 16 }}>
                  {done ? "✓" : "◆"}
                </span>
                <span style={{ textDecoration: done ? "line-through" : "none" }}>{o.text}</span>
              </div>
            );
          })}
          {beat.hint && <div style={hint}>💡 {beat.hint}</div>}
          {foundNotes(state) > 0 && (
            <div style={{ ...hint, fontStyle: "normal" }}>
              📌 Morfars lappar: {foundNotes(state)}/{MEMORY_NOTES.length}
            </div>
          )}
          {/* Kapitelprogress som tunn mässingslinje */}
          <div style={barOuter}>
            <div style={{ ...barFill, width: `${(idx / (STORY_BEATS.length - 1)) * 100}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  width: 380,
  maxWidth: "min(86vw, 420px)",
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 8,
  padding: "9px 13px 11px",
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 8px 22px rgba(0,0,0,0.4)`,
  zIndex: 25,
  fontFamily: FONTS.body,
};
const head: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  cursor: "pointer",
  marginBottom: 4,
};
const chapterNo: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: 1.2,
  color: C.brassDim,
};
const chapterTitle: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontSize: 15,
  fontWeight: 800,
  color: BURGUNDY,
};
const objRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  fontSize: 12.5,
  padding: "2px 0",
};
const hint: React.CSSProperties = {
  fontSize: 11,
  color: "#7a6f5a",
  marginTop: 4,
  fontStyle: "italic",
};
const barOuter: React.CSSProperties = {
  height: 3,
  background: "#d8cbaa",
  borderRadius: 2,
  marginTop: 8,
  overflow: "hidden",
};
const barFill: React.CSSProperties = {
  height: "100%",
  background: `linear-gradient(90deg, ${C.brass}, ${C.brassBright})`,
  transition: "width 0.6s",
};
