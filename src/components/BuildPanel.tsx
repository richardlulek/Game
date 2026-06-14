import { useState } from "react";
import { msek } from "../engine/format";
import { PROP_TYPES } from "../engine/data";
import type { GameAction, GameState, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";

interface BuildPanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function BuildPanel({ state, dispatch }: BuildPanelProps) {
  const [sel, setSel] = useState<Record<number, PropTypeKey>>({});
  return (
    <div>
      <div style={S.marketBar}>
        <span>Tomter till salu</span>
        <button style={S.smallBtn} onClick={() => dispatch({ type: "REFRESH_LISTINGS" })}>
          ↻ Nya tomter
        </button>
      </div>
      <div style={S.grid}>
        {state.lots
          .filter((l) => !l.owned)
          .map((l) => (
            <div key={l.id} style={S.card}>
              <div style={S.cardHead}>
                <span style={S.badge}>Tomt</span>
                <span style={S.cardDistrict}>{l.districtName}</span>
              </div>
              <div style={S.cardValue}>{msek(l.price)}</div>
              <div style={S.cardRow}>
                <span>Yta</span>
                <strong>{l.area} m²</strong>
              </div>
              <button
                style={{ ...S.buyBtn, ...(state.cash >= l.price ? {} : S.btnDisabled) }}
                disabled={state.cash < l.price}
                onClick={() => dispatch({ type: "BUY_LOT", id: l.id })}
              >
                Köp tomt
              </button>
            </div>
          ))}
      </div>
      <h3 style={{ ...S.h3, marginTop: 24 }}>Mina tomter</h3>
      <div style={S.grid}>
        {state.lots.filter((l) => l.owned).length === 0 && (
          <div style={S.empty}>Inga tomter ännu. Köp en ovan för att bygga.</div>
        )}
        {state.lots
          .filter((l) => l.owned)
          .map((l) => {
            const chosen: PropTypeKey = sel[l.id] || "bostad";
            const t = PROP_TYPES[chosen];
            const cost = l.area * t.buildCostM2;
            return (
              <div key={l.id} style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.badge}>Min tomt</span>
                  <span style={S.cardDistrict}>{l.districtName}</span>
                </div>
                <div style={S.cardRow}>
                  <span>Yta</span>
                  <strong>{l.area} m²</strong>
                </div>
                <select
                  value={chosen}
                  onChange={(e) => setSel({ ...sel, [l.id]: e.target.value as PropTypeKey })}
                  style={S.select}
                >
                  {Object.entries(PROP_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <div style={S.cardRow}>
                  <span>Byggkostnad</span>
                  <strong>{msek(cost)}</strong>
                </div>
                <div style={S.cardRow}>
                  <span>Byggtid</span>
                  <strong>{t.buildMonths} mån</strong>
                </div>
                <div style={{ fontSize: 11, color: "#27660a", margin: "4px 0 8px", padding: "5px 8px", background: "#eef5ee", borderRadius: 6 }}>
                  Vid färdigställande: Reputation +5 · 20 % lägre vakans
                </div>
                <button
                  style={S.buyBtn}
                  onClick={() => dispatch({ type: "BUILD", id: l.id, propType: chosen })}
                >
                  Påbörja bygge
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
