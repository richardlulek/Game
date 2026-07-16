import { MILESTONES } from "../engine/data";
import type { GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
}

export function MilestonesPanel({ state }: Props) {
  const done = state.milestones ?? [];
  const completed = MILESTONES.filter((m) => done.includes(m.id));
  const remaining = MILESTONES.filter((m) => !done.includes(m.id));

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, margin: 0 }}>Milestones</h2>
        <div style={{ fontSize: 13, color: C.creamSoft }}>
          {completed.length} / {MILESTONES.length} achieved
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: C.woodDark, borderRadius: 4, marginBottom: 20, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${(completed.length / MILESTONES.length) * 100}%`,
          background: C.brass,
          borderRadius: 4,
          transition: "width 0.5s",
        }} />
      </div>

      {/* Remaining */}
      {remaining.length > 0 && (
        <>
          <h3 style={{ fontFamily: FONTS.heading, fontSize: 14, color: C.brassBright, marginBottom: 10 }}>Next goals</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
            {remaining.map((ms) => {
              const isNext = ms.check(state);
              return (
                <div key={ms.id} style={{
                  background: isNext ? "#1e2a0e" : C.wood,
                  border: `1px solid ${isNext ? C.positive : C.brass}44`,
                  borderRadius: 6,
                  padding: "12px 14px",
                  opacity: 0.85,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: isNext ? C.positive : C.creamSoft, fontSize: 13 }}>
                      🎯 {ms.title}
                    </span>
                    {isNext && (
                      <span style={{ fontSize: 10, color: C.positive, fontWeight: 700 }}>ACHIEVED NEXT TICK</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.creamSoft, marginBottom: 6 }}>{ms.desc}</div>
                  <div style={{ fontSize: 11, color: C.gold }}>Reward: {ms.reward}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <>
          <h3 style={{ fontFamily: FONTS.heading, fontSize: 14, color: C.brassBright, marginBottom: 10 }}>Avklarade</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {completed.map((ms) => (
              <div key={ms.id} style={{
                background: C.woodDark,
                border: `1px solid ${C.brass}33`,
                borderRadius: 6,
                padding: "10px 14px",
                opacity: 0.7,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 16 }}>🏅</span>
                  <span style={{ fontWeight: 700, color: C.brassBright, fontSize: 13 }}>{ms.title}</span>
                </div>
                <div style={{ fontSize: 11, color: C.creamSoft }}>{ms.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
