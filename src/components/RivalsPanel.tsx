import { msek } from "../engine/format";
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
}

export function RivalsPanel({ state, equity }: RivalsPanelProps) {
  const all: RankRow[] = [
    { name: "DU", equity, units: state.portfolio.length, me: true },
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
              ...S.cardRow,
              padding: "10px 0",
              fontWeight: c.me ? 700 : 400,
              color: c.me ? BURGUNDY : "#333",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span>
              #{i + 1} &nbsp; {c.name}
            </span>
            <span>
              {msek(c.equity)} · {c.units} obj
            </span>
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
