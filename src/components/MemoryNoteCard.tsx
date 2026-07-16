/* Morfars minneslapp – pergamentkort som visas när en gul lapp på
   kartan klickats (uiStore.openNoteId). Stängs med × eller klick utanför. */

import { MEMORY_NOTES } from "../engine/story";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";
import { StoryPortrait } from "./StoryPortrait";

export function MemoryNoteCard() {
  const openNoteId = useUiStore((s) => s.openNoteId);
  const setOpenNote = useUiStore((s) => s.setOpenNote);
  const note = MEMORY_NOTES.find((n) => n.id === openNoteId);
  if (!note) return null;

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={title}>📌 {note.title}</span>
        <button style={closeBtn} onClick={() => setOpenNote(null)} title="Put the note back">
          ×
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <StoryPortrait id="morfar" size={52} />
        <div style={body}>{note.text}</div>
      </div>
      <div style={foot}>A yellow note in Grandpa’s handwriting. The ink has faded, not the humor.</div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  left: 12,
  bottom: 12,
  width: 340,
  maxWidth: "82vw",
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 8,
  padding: "12px 14px",
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 10px 26px rgba(0,0,0,0.45)`,
  zIndex: 30,
  fontFamily: FONTS.body,
  animation: "fi-overlay-fade 0.25s ease",
};
const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 6,
};
const title: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontWeight: 800,
  fontSize: 15,
  color: BURGUNDY,
};
const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  color: "#8a7c5e",
  padding: 0,
};
const body: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  fontStyle: "italic",
};
const foot: React.CSSProperties = {
  marginTop: 8,
  fontSize: 10.5,
  color: "#8a7c5e",
};
