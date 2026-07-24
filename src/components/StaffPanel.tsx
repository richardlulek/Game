import { execSalaryMult, talentStars } from "../engine/executives";
import { kr } from "../engine/format";
import { ELECTION_PERIOD, FAVOR_REQUEST_COST, politicalFavorActive } from "../engine/politics";
import { STAFF_ROLES, hireFee, salariesTotal } from "../engine/progression";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS, THEME } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

const ADVISOR_DEFS = [
  { id: "ekonom", name: "Economic advisor", repRequired: 60, effect: "Provides analytics support and market overviews.", icon: "📊" },
  { id: "jurist", name: "Legal advisor", repRequired: 80, effect: "Halves rezoning time for zone changes.", icon: "⚖️" },
  { id: "kapitalstrateg", name: "Capital strategist", repRequired: 95, effect: "Lowers the interest spread by 0.2%.", icon: "💼" },
];

export function StaffPanel({ state, dispatch }: Props) {
  const salaries = salariesTotal(state);

  return (
    <div>
      <div style={strip}>
        <div>
          <div style={stripTitle}>MANAGEMENT TEAM</div>
          <div style={stripSub}>Hire managers whose expertise grants passive benefits.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.brassDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Total salary</div>
          <div style={{ fontFamily: FONTS.heading, color: C.brassBright, fontSize: 16 }}>{kr(salaries)}/mo</div>
        </div>
      </div>

      <div style={grid}>
        {STAFF_ROLES.map((r) => {
          const level = state.staff?.[r.id] ?? 0;
          const atMax = level >= r.maxLevel;
          const fee = hireFee(r.id, level + 1);
          const canHire = !atMax && state.cash >= fee && !state.gameOver;
          const exec = state.executives?.[r.id];
          return (
            <div key={r.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={cardTitle}>{r.name}</span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  {level > 0 ? `${kr(Math.round(r.baseSalary * level * execSalaryMult(exec)))}/mo` : "not employed"}
                </span>
              </div>
              {level > 0 && exec && (
                <div style={{ fontSize: 12, color: C.burgundy, marginTop: 4, fontWeight: 700 }}>
                  {exec.name}{" "}
                  <span style={{ color: C.brass }} title={`Talent scales the role's effect and salary`}>
                    {"★".repeat(talentStars(exec.talent))}{"☆".repeat(5 - talentStars(exec.talent))}
                  </span>
                  {exec.raises > 0 && (
                    <span style={{ color: C.inkSoft, fontWeight: 400 }}> · {exec.raises} matched raise{exec.raises > 1 ? "s" : ""}</span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: C.inkSoft, margin: "6px 0", lineHeight: 1.4 }}>{r.desc}</div>
              <span style={effectChip}>{r.effect}</span>

              <div style={{ display: "flex", gap: 5, margin: "10px 0 4px" }}>
                {Array.from({ length: r.maxLevel }).map((_, i) => (
                  <span key={i} style={{ fontSize: 16, color: i < level ? C.brass : "#cbbd9b" }}>
                    {i < level ? "●" : "○"}
                  </span>
                ))}
                <span style={{ fontSize: 11, color: C.inkSoft, alignSelf: "center", marginLeft: 4 }}>
                  Level {level}/{r.maxLevel}
                </span>
              </div>

              <div style={gold} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={canHire ? primaryBtn : disabledBtn}
                  disabled={!canHire}
                  onClick={() => dispatch({ type: "HIRE_STAFF", role: r.id })}
                >
                  {atMax ? "Max level" : level === 0 ? `Hire · ${kr(fee)}` : `Promote · ${kr(fee)}`}
                </button>
                {level > 0 && (
                  <button style={fireBtn} onClick={() => dispatch({ type: "FIRE_STAFF", role: r.id })}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* City Hall – politik light */}
      {(() => {
        const absM = state.year * 12 + state.month;
        const toElection = (ELECTION_PERIOD - (absM % ELECTION_PERIOD)) % ELECTION_PERIOD;
        const favor = politicalFavorActive(state);
        return (
          <div style={{ ...strip, marginTop: 20 }}>
            <div>
              <div style={stripTitle}>CITY HALL</div>
              <div style={stripSub}>
                {state.electionResult ? `In power: ${state.electionResult}` : "No election has been held yet"}
                {" · "}next election in {toElection === 0 ? ELECTION_PERIOD : toElection} mo
                {state.politics?.backed ? " · you are backing a campaign" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              {favor ? (
                <span style={{ color: C.brassBright, fontWeight: 700 }}>
                  🤝 Political favor · {state.politics!.favorMonthsLeft} mo left
                  <div style={{ fontSize: 10.5, color: C.creamSoft, fontWeight: 400 }}>
                    faster zoning · −8% auction opening bids{state.politics?.secret ? " · scandal risk" : ""}
                  </div>
                </span>
              ) : (
                <span style={{ color: C.creamSoft }}>No political favor</span>
              )}
              {/* Politiskt kapital: löpande relation, spenderas på interimtjänst */}
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <span style={{ color: (state.politics?.capital ?? 0) >= FAVOR_REQUEST_COST ? C.positive : C.creamSoft }}>
                  🏛️ Political capital: {Math.round(state.politics?.capital ?? 0)}/100
                </span>
                {!favor && (
                  <button
                    onClick={() => dispatch({ type: "REQUEST_POLITICAL_FAVOR" })}
                    disabled={(state.politics?.capital ?? 0) < FAVOR_REQUEST_COST}
                    style={{
                      marginLeft: 8, padding: "2px 8px", fontSize: 10.5, borderRadius: 4,
                      border: `1px solid ${C.brass}`, background: C.burgundy, color: C.brassBright,
                      cursor: (state.politics?.capital ?? 0) >= FAVOR_REQUEST_COST ? "pointer" : "default",
                      opacity: (state.politics?.capital ?? 0) >= FAVOR_REQUEST_COST ? 1 : 0.5, fontWeight: 700,
                    }}
                    title={`Spend ${FAVOR_REQUEST_COST} capital on 12 months of city-hall favor between elections.`}
                  >
                    Call in a favor ({FAVOR_REQUEST_COST})
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Advisory Board */}
      <div style={{ ...strip, marginTop: 20, flexDirection: "column", alignItems: "flex-start" }}>
        <div style={stripTitle}>ADVISORY BOARD</div>
        <div style={{ ...stripSub, marginBottom: 12 }}>Unlocked automatically at reputation milestones. Grants passive company benefits.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, width: "100%" }}>
          {ADVISOR_DEFS.map((adv) => {
            const unlocked = (state.advisors ?? []).includes(adv.id);
            return (
              <div key={adv.id} style={{
                ...card,
                opacity: unlocked ? 1 : 0.5,
                border: `1px solid ${unlocked ? C.brass : C.brassDim}`,
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{adv.icon}</div>
                <div style={cardTitle}>{adv.name}</div>
                <div style={{ fontSize: 12, color: C.inkSoft, margin: "4px 0 6px" }}>{adv.effect}</div>
                <div style={gold} />
                {unlocked ? (
                  <span style={{ ...effectChip, background: "#e2ecd9" }}>ACTIVE</span>
                ) : (
                  <span style={{ fontSize: 11, color: C.inkSoft }}>
                    Requires reputation {adv.repRequired}
                    {" "}(current: {Math.round(state.reputation)})
                  </span>
                )}
              </div>
            );
          })}
        </div>
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
  background: "#9a8f7a", color: "#dfe6f0", fontWeight: 700, fontSize: 13, cursor: "default", fontFamily: FONTS.body,
};
const fireBtn: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 4, border: `1px solid ${C.brassDim}`,
  background: "transparent", color: C.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONTS.body,
};
