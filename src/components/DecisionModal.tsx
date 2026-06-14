import { playClick } from "../audio/sound";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

/** Modal som blockerar tills spelaren tagit ett beslut. */
export function DecisionModal({ state, dispatch }: Props) {
  const d = state.pendingDecision;
  if (!d) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <span style={{ fontSize: 22 }}>🤔</span>
          <span>{d.title}</span>
        </div>
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
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,8,12,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 20,
  animation: "fi-overlay-fade 0.2s ease",
};

const modal: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 22,
  maxWidth: 440,
  width: "100%",
  boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
  animation: "fi-modal-pop 0.25s cubic-bezier(.2,.8,.2,1)",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 17,
  fontWeight: 800,
  color: BURGUNDY,
  marginBottom: 10,
};

const body: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  lineHeight: 1.5,
  marginBottom: 18,
};

const optionBtn = (primary: boolean): React.CSSProperties => ({
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${primary ? BURGUNDY : "#ddd"}`,
  background: primary ? BURGUNDY + "10" : "#fafafa",
  color: primary ? BURGUNDY : "#333",
  cursor: "pointer",
});
