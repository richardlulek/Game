import { competitorLevel, tierForLevel } from "../engine/company";
import { kr, msek, pct } from "../engine/format";
import { relationSummary } from "../engine/rivalArcs";
import { rivalStanding, standingLabel } from "../engine/standing";
import type { GameState } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY, C } from "../styles/tokens";
import { RivalCard } from "./RivalCard";

interface RivalsPanelProps {
  state: GameState;
  equity: number;
}

interface RankRow {
  name: string;
  equity: number;
  units: number;
  me?: boolean;
  lastBuy?: string;
  monthlyNOI?: number;
  strategy?: string;
  preferredDistrict?: string;
  /** Bolagsnivå 1–6 (samma trappa som spelarens). */
  level: number;
}

export function RivalsPanel({ state, equity }: RivalsPanelProps) {
  const myMonthlyNOI = state.portfolio.reduce(
    (s, p) => s + p.tenants.reduce((a, t) => a + t.rent, 0),
    0,
  );
  const prevEq = state.prevEquity ?? equity;
  const myDelta = equity - prevEq;

  const all: RankRow[] = [
    {
      name: "YOU",
      equity,
      units: state.portfolio.filter(p => p.status === "klar").length,
      me: true,
      monthlyNOI: myMonthlyNOI,
      level: state.companyLevel ?? 1,
    },
    ...state.competitors.map((c) => ({
      ...c,
      units: c.portfolio?.length ?? c.units,
      strategy: c.strategy,
      preferredDistrict: c.preferredDistrict,
      level: competitorLevel(c),
    })),
  ].sort((a, b) => b.equity - a.equity);

  const rankBadge = (i: number, me: boolean) => (
    <span style={{ fontWeight: 800, fontSize: 14, color: me ? BURGUNDY : C.inkSoft, minWidth: 26 }}>
      #{i + 1}
    </span>
  );

  const equityCol = (c: RankRow) => (
    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: c.me ? BURGUNDY : "#333" }}>{msek(c.equity)}</div>
      <div style={{ fontSize: 10.5, color: "#999" }}>
        {tierForLevel(c.level).icon} {tierForLevel(c.level).name}
      </div>
      {c.me && myDelta !== 0 && (
        <div style={{ fontSize: 11, color: myDelta > 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
          {myDelta > 0 ? "▲" : "▼"} {msek(Math.abs(myDelta))} this month
        </div>
      )}
    </div>
  );

  const statsFor = (c: RankRow) => {
    const comp = state.competitors.find((x) => x.name === c.name);
    const stake = state.stocks.find((s) => s.competitorName === c.name);
    return (
      <>
        <div style={{ fontSize: 12, color: "#888", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>{c.units} properties</span>
          {c.monthlyNOI !== undefined && <span>NOI: {kr(c.monthlyNOI)}/mo</span>}
          {c.lastBuy && <span>Latest purchase: {c.lastBuy}</span>}
          {!c.me && c.strategy && (
            <span style={{ fontWeight: 700, color: "#7b5a2e" }}>
              Strategy: {c.strategy}{c.preferredDistrict ? ` (${c.preferredDistrict})` : ""}
            </span>
          )}
          {!c.me && (() => {
            const v = rivalStanding(state, c.name);
            const sl = standingLabel(v);
            return (
              <span
                title={`Standing ${v > 0 ? "+" : ""}${v} — relations you build or burn`}
                style={{ fontWeight: 700, color: sl.color, background: sl.color + "1e", border: `1px solid ${sl.color}55`, padding: "1px 7px", borderRadius: 8 }}
              >
                {sl.label}{v !== 0 ? ` ${v > 0 ? "+" : ""}${Math.round(v)}` : ""}
              </span>
            );
          })()}
          {!c.me && state.nemesis === c.name && (
            <span title="Your nemesis — the most hostile rival" style={{ fontWeight: 800, color: "#fff", background: "#b23030", padding: "1px 7px", borderRadius: 8 }}>
              ⚔️ NEMESIS
            </span>
          )}
        </div>
        {!c.me && relationSummary(state, c.name) && (
          <div style={{ fontSize: 12, marginTop: 3, color: "#7b5a2e", fontStyle: "italic" }}>
            🏙️ {relationSummary(state, c.name)}
          </div>
        )}
        {(() => {
          if (c.me || !comp?.agenda) return null;
          const ag = comp.agenda;
          const progress =
            ag.kind === "district"
              ? comp.portfolio.filter((p) => p.district === ag.district).length / ag.target
              : ag.kind === "units"
                ? comp.portfolio.filter((p) => p.status === "klar").length / ag.target
                : comp.equity / ag.target;
          const pctDone = Math.min(100, Math.round(progress * 100));
          return (
            <div style={{ fontSize: 12, marginTop: 3 }}>
              <span style={{ color: pctDone >= 80 ? "#c0392b" : "#4757c8", fontWeight: 600 }}>
                🎯 Agenda: {ag.label} — {pctDone}%{ag.announced ? " ✓ ACHIEVED" : ""}
              </span>
            </div>
          );
        })()}
        {!c.me && stake && stake.owned > 0 && (
          <div style={{ fontSize: 12, color: C.brassDim, marginTop: 3, fontWeight: 600 }}>
            Your stake: {pct(stake.owned / stake.sharesOutstanding)} · {kr(stake.owned * stake.price)}
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={S.h3}>Rivals — leaderboard by equity</h3>
      <div style={S.financeCol}>
        {all.map((c, i) => (
          <div key={c.name} style={{ padding: "14px 0", borderBottom: "1px solid #f0f0f0" }}>
            {c.me ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {rankBadge(i, true)}
                    <span style={{ fontWeight: 700, color: BURGUNDY, fontSize: 15 }}>
                      {tierForLevel(c.level).icon} YOU
                    </span>
                  </span>
                  {equityCol(c)}
                </div>
                {statsFor(c)}
              </>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {rankBadge(i, false)}
                <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <RivalCard company={c.name} showSignature>{statsFor(c)}</RivalCard>
                  {equityCol(c)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 10 }}>
        Competitors grow every month and can buy properties before you. Beat them with higher
        equity.
      </div>
    </div>
  );
}
