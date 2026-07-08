import { kr, msek } from "../engine/format";
import { RESEARCH } from "../engine/progression";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS, THEME } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

export function ResearchPanel({ state, dispatch }: Props) {
  const active = state.activeResearch;
  const activeDef = active ? RESEARCH.find((r) => r.id === active.id) : null;
  const done = state.researchDone ?? [];

  return (
    <div>
      <div style={strip}>
        <div>
          <div style={stripTitle}>FORSKNING &amp; UTVECKLING</div>
          <div style={stripSub}>Lås upp permanenta förbättringar för hela koncernen.</div>
        </div>
        {active && <div style={{ fontFamily: FONTS.heading, color: C.brassBright, fontSize: 13 }}>1 projekt pågår</div>}
      </div>

      {active && activeDef && (
        <div style={{ ...card, borderColor: C.brassBright, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={cardTitle}>⏳ {activeDef.name}</span>
            <span style={{ fontSize: 12, color: C.inkSoft }}>
              {active.monthsTotal - active.monthsLeft} av {active.monthsTotal} mån
            </span>
          </div>
          <div style={progressWrap}>
            <div style={{ ...progressFill, width: `${((active.monthsTotal - active.monthsLeft) / active.monthsTotal) * 100}%` }} />
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>{activeDef.effect}</div>
        </div>
      )}

      <div style={grid}>
        {RESEARCH.map((r) => {
          const isDone = done.includes(r.id);
          const isActive = active?.id === r.id;
          const blocked = !!active || state.cash < r.cost;
          return (
            <div key={r.id} style={{ ...card, opacity: isDone ? 0.78 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={cardTitle}>{r.name}</span>
                {isDone && <span style={doneBadge}>✓ Utforskat</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "6px 0", lineHeight: 1.4 }}>{r.desc}</div>
              <span style={effectChip}>{r.effect}</span>
              <div style={gold} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>
                <span>Kostnad: <strong style={{ color: C.ink, fontFamily: FONTS.heading }}>{msek(r.cost)}</strong></span>
                <span>Tid: <strong style={{ color: C.ink, fontFamily: FONTS.heading }}>{r.months} mån</strong></span>
              </div>
              {isDone ? null : isActive ? (
                <div style={{ textAlign: "center", color: C.brassDim, fontWeight: 700, fontSize: 13 }}>⏳ Pågår…</div>
              ) : (
                <>
                  <button
                    style={blocked ? disabledBtn : primaryBtn}
                    disabled={blocked}
                    onClick={() => dispatch({ type: "START_RESEARCH", id: r.id })}
                  >
                    Starta forskning
                  </button>
                  {active && <div style={hint}>Ett projekt pågår redan</div>}
                  {!active && state.cash < r.cost && <div style={hint}>Otillräcklig budget ({kr(r.cost - state.cash)} saknas)</div>}
                </>
              )}
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
const doneBadge: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.positive, background: "#e2ecd9", border: `1px solid ${C.positive}55`, padding: "2px 8px", borderRadius: 10 };
const effectChip: React.CSSProperties = { display: "inline-block", fontSize: 11, fontWeight: 700, color: C.green, background: "#e2ecd9", border: `1px solid ${C.green}44`, padding: "2px 9px", borderRadius: 10 };
const gold: React.CSSProperties = { height: 2, background: THEME.goldRule, opacity: 0.6, margin: "10px 0" };
const progressWrap: React.CSSProperties = { height: 9, background: "#d8c7a0", borderRadius: 4, overflow: "hidden", marginTop: 8 };
const progressFill: React.CSSProperties = { height: "100%", background: C.burgundy, borderRadius: 4, transition: "width 0.3s" };
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "9px", borderRadius: 4, border: `1px solid ${C.brass}`,
  background: C.burgundy, color: C.brassBright, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
};
const disabledBtn: React.CSSProperties = {
  width: "100%", padding: "9px", borderRadius: 4, border: "1px solid #8a7f6a",
  background: "#9a8f7a", color: "#dfe6f0", fontWeight: 700, fontSize: 13, cursor: "default", fontFamily: FONTS.body,
};
const hint: React.CSSProperties = { fontSize: 11, color: C.inkSoft, textAlign: "center", marginTop: 5 };
