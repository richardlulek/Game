import { loanTerms } from "../engine/finance";
import { msek } from "../engine/format";
import type { GameAction, GameState } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";

interface RivalsPanelProps {
  state: GameState;
  equity: number;
  dispatch: (action: GameAction) => void;
}

interface RankRow {
  name: string;
  equity: number;
  units: number;
  me?: boolean;
}

export function RivalsPanel({ state, equity, dispatch }: RivalsPanelProps) {
  const all: RankRow[] = [
    { name: "DU", equity, units: state.portfolio.length, me: true },
    ...state.competitors,
  ].sort((a, b) => b.equity - a.equity);
  const { maxLtv } = loanTerms(state);
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={S.h3}>Topplista — eget kapital</h3>
      <div style={S.financeCol}>
        {all.map((c, i) => {
          const price = Math.round(c.equity * 1.35);
          const down = price * (1 - maxLtv);
          const canBuy = !c.me && state.cash >= down;
          return (
            <div
              key={c.name}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div
                style={{
                  ...S.cardRow,
                  padding: 0,
                  fontWeight: c.me ? 700 : 400,
                  color: c.me ? BURGUNDY : "#333",
                }}
              >
                <span>
                  #{i + 1} &nbsp; {c.name}
                </span>
                <span>
                  {msek(c.equity)} · {c.units} obj
                </span>
              </div>
              {!c.me && (
                <button
                  style={{
                    ...S.upgBtn,
                    marginTop: 6,
                    width: "100%",
                    ...(canBuy ? {} : { opacity: 0.5 }),
                  }}
                  disabled={!canBuy}
                  title={`Handpenning ${msek(down)}`}
                  onClick={() => dispatch({ type: "ACQUIRE_RIVAL", name: c.name })}
                >
                  🏆 Lägg uppköpsbud {msek(price)}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 10 }}>
        Konkurrenterna växer och bjuder mot dig i auktionerna. Köp upp dem alla för monopol – eller
        börsnotera bolaget när det är stort nog.
      </div>
    </div>
  );
}
