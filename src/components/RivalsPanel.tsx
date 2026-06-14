import { kr, msek } from "../engine/format";
import type { GameState } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";

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
}

export function RivalsPanel({ state, equity }: RivalsPanelProps) {
  const myMonthlyNOI = state.portfolio.reduce(
    (s, p) => s + p.tenants.reduce((a, t) => a + t.rent, 0),
    0,
  );
  const all: RankRow[] = [
    { name: "DU", equity, units: state.portfolio.length, me: true, monthlyNOI: myMonthlyNOI },
    ...state.competitors,
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
                #{i + 1} &nbsp; {c.name}
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: c.me ? BURGUNDY : "#333" }}>
                {msek(c.equity)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 3, display: "flex", gap: 12 }}>
              <span>{c.units} objekt</span>
              {c.monthlyNOI !== undefined && <span>NOI: {kr(c.monthlyNOI)}/mån</span>}
              {c.lastBuy && <span>Senaste köp: {c.lastBuy}</span>}
            </div>
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
