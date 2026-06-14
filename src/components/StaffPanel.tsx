import { kr, msek } from "../engine/format";
import { STAFF_ROLES, hireFee, salariesTotal } from "../engine/progression";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS, THEME } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

export function StaffPanel({ state, dispatch }: Props) {
  const salaries = salariesTotal(state);

  return (
    <div>
      <div style={strip}>
        <div>
          <div style={stripTitle}>LEDNINGSGRUPP</div>
          <div style={stripSub}>Anställ chefer vars kompetens ger passiva fördelar.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.brassDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Total lön</div>
          <div style={{ fontFamily: FONTS.heading, color: C.brassBright, fontSize: 16 }}>{kr(salaries)}/mån</div>
        </div>
      </div>

      <div style={grid}>
        {STAFF_ROLES.map((r) => {
          const level = state.staff?.[r.id] ?? 0;
          const atMax = level >= r.maxLevel;
          const fee = hireFee(r.id, level + 1);
          const canHire = !atMax && state.cash >= fee && !state.gameOver;
          return (
            <div key={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={cardTitle}>{r.name}</span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  {level > 0 ? `${kr(r.baseSalary * level)}/mån` : "ej anställd"}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "6px 0", lineHeight: 1.4 }}>{r.desc}</div>
              <span style={effectChip}>{r.effect}</span>

              <div style={{ display: "flex", gap: 5, margin: "10px 0 4px" }}>
                {Array.from({ length: r.maxLevel }).map((_, i) => (
                  <span key={i} style={{ fontSize: 16, color: i < level ? C.brass : "#cbbd9b" }}>
                    {i < level ? "●" : "○"}
                  </span>
                ))}
                <span style={{ fontSize: 11, color: C.inkSoft, alignSelf: "center", marginLeft: 4 }}>
                  Nivå {level}/{r.maxLevel}
                </span>
              </div>

              <div style={gold} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={canHire ? primaryBtn : disabledBtn}
                  disabled={!canHire}
                  onClick={() => dispatch({ type: "HIRE_STAFF", role: r.id })}
                >
                  {atMax ? "Högsta nivå" : level === 0 ? `Anställ · ${msek(fee)}` : `Befordra · ${msek(fee)}`}
                </button>
                {level > 0 && (
                  <button style={fireBtn} onClick={() => dispatch({ type: "FIRE_STAFF", role: r.id })}>
                    Avskeda
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const strip: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: C.wood, border: `1px solid ${C.brass}`, borderRadius: 6,
  padding: "12px 16px", marginBottom: 16,
};
const stripTitle: React.CSSProperties = { fontFamily: FONTS.display, fontSize: 18, fontWeight: 900, color: C.brassBright, letterSpacing: 1 };
const stripSub: React.CSSProperties = { fontSize: 12, color: C.creamSoft, marginTop: 2 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 };
const card: React.CSSProperties = {
  background: THEME.parchment, border: `1px solid ${C.brass}`, borderRadius: 6,
  padding: 14, color: C.ink, boxShadow: THEME.insetGold,
};
const cardTitle: React.CSSProperties = { fontFamily: FONTS.heading, fontSize: 16, fontWeight: 700, color: C.burgundy };
const effectChip: React.CSSProperties = { display: "inline-block", fontSize: 11, fontWeight: 700, color: C.green, background: "#e2ecd9", border: `1px solid ${C.green}44`, padding: "2px 9px", borderRadius: 10 };
const gold: React.CSSProperties = { height: 2, background: THEME.goldRule, opacity: 0.6, margin: "10px 0" };
const primaryBtn: React.CSSProperties = {
  flex: 1, padding: "9px", borderRadius: 4, border: `1px solid ${C.brass}`,
  background: C.burgundy, color: C.brassBright, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
};
const disabledBtn: React.CSSProperties = {
  flex: 1, padding: "9px", borderRadius: 4, border: "1px solid #8a7f6a",
  background: "#9a8f7a", color: "#e8e0d0", fontWeight: 700, fontSize: 13, cursor: "default", fontFamily: FONTS.body,
};
const fireBtn: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 4, border: `1px solid ${C.brassDim}`,
  background: "transparent", color: C.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
};
