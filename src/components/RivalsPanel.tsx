import { competitorLevel, tierForLevel } from "../engine/company";
import { kr, msek, pct } from "../engine/format";
import type { GameState } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY, C } from "../styles/tokens";

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
      name: "DU",
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
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={S.h3}>Topplista — eget kapital</h3>
      <div style={S.financeCol}>
        {all.map((c, i) => (
          <div
            key={c.name}
            style={{
              padding: "12px 0",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: c.me ? 700 : 600, color: c.me ? BURGUNDY : "#333", fontSize: 14 }}>
                #{i + 1} &nbsp; {tierForLevel(c.level).icon} {c.name}
                <span style={{ fontSize: 11, color: "#999", fontWeight: 600 }}>
                  {" "}· {tierForLevel(c.level).name}
                </span>
              </span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: c.me ? BURGUNDY : "#333" }}>{msek(c.equity)}</div>
                {c.me && myDelta !== 0 && (
                  <div style={{ fontSize: 11, color: myDelta > 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                    {myDelta > 0 ? "▲" : "▼"} {msek(Math.abs(myDelta))} denna månad
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>{c.units} objekt</span>
              {c.monthlyNOI !== undefined && <span>NOI: {kr(c.monthlyNOI)}/mån</span>}
              {c.lastBuy && <span>Senaste köp: {c.lastBuy}</span>}
              {!c.me && c.strategy && (
                <span style={{ fontWeight: 700, color: "#7b5a2e" }}>
                  Strategi: {c.strategy}{c.preferredDistrict ? ` (${c.preferredDistrict})` : ""}
                </span>
              )}
            </div>
            {/* Rivalens agenda med framsteg */}
            <div style={{ fontSize: 12, marginTop: 3 }}>
              {(() => {
                if (c.me) return null;
                const comp = state.competitors.find((x) => x.name === c.name);
                const ag = comp?.agenda;
                if (!ag || !comp) return null;
                const progress =
                  ag.kind === "district"
                    ? comp.portfolio.filter((p) => p.district === ag.district).length / ag.target
                    : ag.kind === "units"
                      ? comp.portfolio.filter((p) => p.status === "klar").length / ag.target
                      : comp.equity / ag.target;
                const pctDone = Math.min(100, Math.round(progress * 100));
                return (
                  <span style={{ color: pctDone >= 80 ? "#c0392b" : "#4757c8", fontWeight: 600 }}>
                    🎯 Agenda: {ag.label} — {pctDone} %{ag.announced ? " ✓ UPPNÅTT" : ""}
                  </span>
                );
              })()}
            </div>
            {(() => {
              if (c.me) return null;
              const stock = state.stocks.find((s) => s.competitorName === c.name);
              if (!stock || stock.owned <= 0) return null;
              return (
                <div style={{ fontSize: 12, color: C.brassDim, marginTop: 3, fontWeight: 600 }}>
                  Din ägarandel: {pct(stock.owned / stock.sharesOutstanding)} · {kr(stock.owned * stock.price)}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 10 }}>
        Konkurrenterna växer varje månad och kan köpa objekt före dig. Slå dem genom högre eget
        kapital.
      </div>
    </div>
  );
}
