import { playClick } from "../audio/sound";
import type { GameAction, GameState } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

/** Modal som blockerar tills spelaren tagit ett beslut. */
export function DecisionModal({ state, dispatch }: Props) {
  const cinematic = useUiStore((s) => s.cinematic);
  const d = state.pendingDecision;
  if (!d) return null;
  // Berättelseregi: scenen får spela klart innan brevet öppnas.
  if (cinematic && cinematic.id === d.id) return null;
  // Berättelselägets brev: kan inte skjutas upp (kedjade beats får inte tappas).
  const isStory = d.id.startsWith("story:");

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          {!isStory && <span style={{ fontSize: 22 }}>🤔</span>}
          <span>{d.title}</span>
        </div>
        <div style={goldRule} />
        <div style={body}>{d.text}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {d.options.map((o, i) => (
            <button
              key={i}
              style={optionBtn(i === 0)}
              onClick={() => {
                playClick();
                dispatch({ type: "RESOLVE_DECISION", optionIndex: i });
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{o.label}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{o.detail}</div>
            </button>
          ))}
        </div>
        {!isStory && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.brassDim}`, paddingTop: 10, textAlign: "center" }}>
            <button
              style={{ background: "none", border: "none", fontSize: 12, color: C.inkSoft, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => dispatch({ type: "SNOOZE_DECISION" })}
            >
              Skjut upp beslutet (−2 reputation)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16,8,8,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 20,
  animation: "fi-overlay-fade 0.2s ease",
};

const modal: React.CSSProperties = {
  background: THEME.parchment,
  border: THEME.brassBorder2,
  borderRadius: 6,
  padding: 22,
  maxWidth: 440,
  width: "100%",
  boxShadow: THEME.panelShadow,
  color: C.ink,
  animation: "fi-modal-pop 0.25s cubic-bezier(.2,.8,.2,1)",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontFamily: FONTS.heading,
  fontSize: 18,
  fontWeight: 800,
  color: BURGUNDY,
  marginBottom: 8,
};

const goldRule: React.CSSProperties = {
  height: 2,
  background: THEME.goldRule,
  marginBottom: 12,
};

const body: React.CSSProperties = {
  fontSize: 14,
  color: C.inkSoft,
  lineHeight: 1.5,
  marginBottom: 18,
};

const optionBtn = (primary: boolean): React.CSSProperties => ({
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 6,
  border: `1px solid ${primary ? C.brass : C.brassDim}`,
  background: primary ? BURGUNDY : "transparent",
  color: primary ? C.brassBright : C.ink,
  cursor: "pointer",
});
