import { useState } from "react";
import { msek } from "../engine/format";
import { PROP_TYPES } from "../engine/data";
import { buildCostMult, buildMonthsDelta } from "../engine/progression";
import type { GameAction, GameState, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";
import { C } from "../styles/tokens";

interface BuildPanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function BuildPanel({ state, dispatch }: BuildPanelProps) {
  const [sel, setSel] = useState<Record<number, PropTypeKey>>({});
  return (
    <div>
      <div style={S.marketBar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>Tomter till salu ({state.lots.filter((l) => !l.owned).length})</span>
          <span style={{ fontSize: 10, color: C.inkSoft }}>Nya tomter tillkommer varje månad</span>
        </div>
        <button
          style={{ ...S.smallBtn, ...(state.cash < 75_000 ? S.btnDisabled : {}), fontSize: 12 }}
          disabled={state.cash < 75_000}
          onClick={() => dispatch({ type: "HIRE_BROKER_LOTS" })}
        >
          🔍 Anlita markmäklare · {msek(75_000)}
        </button>
      </div>
      <div style={S.grid}>
        {state.lots
          .filter((l) => !l.owned)
          .map((l) => {
            const now = state.year * 12 + state.month;
            const monthsLeft = l.expiresMonth !== undefined && l.expiresMonth < 9999
              ? l.expiresMonth - now
              : null;
            return (
            <div key={l.id} style={S.card}>
              <div style={S.cardHead}>
                <span style={S.badge}>Tomt</span>
                <span style={S.cardDistrict}>{l.districtName}</span>
              </div>
              <div style={S.cardValue}>{msek(l.price)}</div>
              {monthsLeft !== null && monthsLeft <= 2 && (
                <div style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 4, marginBottom: 6,
                  background: monthsLeft <= 1 ? "#fde8e8" : "#fff3cc",
                  color: monthsLeft <= 1 ? C.negative : "#9a6a10",
                  fontWeight: 700,
                  border: `1px solid ${monthsLeft <= 1 ? C.negative + "44" : "transparent"}`,
                }}>
                  {monthsLeft <= 0 ? "Utgår snart!" : `Utgår om ${monthsLeft} mån`}
                </div>
              )}
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
            );
          })}
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
            const cost = Math.round(l.area * t.buildCostM2 * buildCostMult(state));
            const months = Math.max(4, t.buildMonths + buildMonthsDelta(state));
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
                  <strong>{months} mån</strong>
                </div>
                <div style={S.cardRow}>
                  <span>Typisk direktavk.</span>
                  <strong style={{ color: "#27660a" }}>
                    {chosen === "bostad" ? "~5 %" : chosen === "kontor" ? "~6 %" : chosen === "butik" ? "~7 %" : "~5,5 %"}
                  </strong>
                </div>
                <div style={S.cardRow}>
                  <span>Vakansrisk</span>
                  <strong>
                    {chosen === "bostad" ? "Låg 4 %" : chosen === "kontor" ? "Hög 10 %" : chosen === "butik" ? "Hög 13 %" : "Låg 7 %"}
                  </strong>
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
