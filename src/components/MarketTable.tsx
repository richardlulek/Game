import { useState } from "react";
import { kr, msek, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import { PROP_TYPES } from "../engine/data";
import type { GameAction, GameState, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";

const TYPE_ICONS: Record<string, string> = {
  bostad: "🏠",
  kontor: "🏢",
  butik: "🏪",
  industri: "🏭",
};

interface MarketTableProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function MarketTable({ state, dispatch }: MarketTableProps) {
  const [lotBuildType, setLotBuildType] = useState<Record<number, PropTypeKey>>({});
  const terms = loanTerms(state);

  return (
    <div>
      {/* Listings section */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "#f0ebe5", borderBottom: "1px solid #e0d8d0" }}>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Objekt till salu ({state.listings.length})</span>
        <button
          style={{ ...S.toolbarMiniBtn, fontSize: 11, color: "#333" }}
          onClick={() => dispatch({ type: "REFRESH_LISTINGS" })}
        >
          ↻ Nya
        </button>
      </div>

      {state.listings.length === 0 ? (
        <div style={S.tableEmpty}>Inga objekt till salu just nu.</div>
      ) : (
        <>
          {/* Listing header */}
          <div style={{ ...S.tableHead, top: 34 }}>
            <div style={{ flex: 2 }}>Objekt</div>
            <div style={{ flex: 1, textAlign: "right" }}>Pris</div>
            <div style={{ flex: 1, textAlign: "right" }}>HDP</div>
            <div style={{ width: 60 }}></div>
          </div>
          {state.listings.map((p, i) => {
            const noi = propPotentialRent(p, state) - propAnnualOpex(p, state);
            const y = noi / p.askPrice;
            const down = p.askPrice * (1 - terms.maxLtv);
            const ok = state.cash >= down && !state.gameOver;
            return (
              <div
                key={p.id}
                style={{ ...S.tableRow, ...(i % 2 === 1 ? S.tableRowAlt : {}), cursor: "default" }}
              >
                <div style={{ flex: 2, minWidth: 0 }}>
                  <span style={{ marginRight: 4 }}>{TYPE_ICONS[p.type] || "🏠"}</span>
                  <span style={{ fontWeight: 600 }}>{p.typeLabel}</span>
                  <span style={{ color: "#999", marginLeft: 4, fontSize: 11 }}>{p.districtName}</span>
                  {p.tenants.length > 0 && <span style={{ marginLeft: 4, color: "#27660a", fontSize: 10 }}>✓ {p.tenants.length}/{p.capacity} uthyrd</span>}
                  <div style={{ fontSize: 10, color: "#888" }}>
                    {p.area} m² · Skick {p.condition} · Avkastning {pct(y)}
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 600 }}>{msek(p.askPrice)}</div>
                <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: "#666" }}>{msek(down)}</div>
                <div style={{ width: 60 }}>
                  <button
                    style={{
                      ...S.miniActionBtn,
                      background: ok ? BURGUNDY : "#aaa",
                      cursor: ok ? "pointer" : "default",
                    }}
                    disabled={!ok}
                    onClick={() => dispatch({ type: "BUY", id: p.id })}
                  >
                    {ok ? "Köp" : "Kassa"}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Lots section */}
      {state.lots.length > 0 && (
        <>
          <div style={{ padding: "8px 12px", background: "#eef4ee", borderTop: "1px solid #d0e0d0", borderBottom: "1px solid #d0e0d0", fontWeight: 700, fontSize: 13, color: "#2a6a3a" }}>
            Tomter ({state.lots.filter(l => !l.owned).length})
          </div>
          {state.lots.filter(l => !l.owned).map((lot, i) => {
            const ok = state.cash >= lot.price && !state.gameOver;
            return (
              <div
                key={lot.id}
                style={{ ...S.tableRow, ...(i % 2 === 1 ? S.tableRowAlt : {}), cursor: "default" }}
              >
                <div style={{ flex: 2 }}>
                  <span style={{ fontWeight: 600 }}>{lot.area} m² tomt</span>
                  <span style={{ color: "#999", marginLeft: 4, fontSize: 11 }}>{lot.districtName}</span>
                </div>
                <div style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 600 }}>{msek(lot.price)}</div>
                <div style={{ flex: 1 }}></div>
                <div style={{ width: 60 }}>
                  <button
                    style={{
                      ...S.miniActionBtn,
                      background: ok ? "#408040" : "#aaa",
                      cursor: ok ? "pointer" : "default",
                    }}
                    disabled={!ok}
                    onClick={() => dispatch({ type: "BUY_LOT", id: lot.id })}
                  >
                    {ok ? "Köp" : "Kassa"}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Owned lots - build section */}
          {state.lots.filter(l => l.owned).map((lot, i) => {
            const chosen: PropTypeKey = lotBuildType[lot.id] || "bostad";
            const t = PROP_TYPES[chosen];
            const cost = lot.area * t.buildCostM2;
            const down = cost * (1 - terms.maxLtv);
            const canBuild = state.cash >= down && !state.gameOver;
            return (
              <div key={lot.id} style={{ padding: "8px 12px", borderBottom: "1px solid #f0ece8", background: i % 2 === 0 ? "#f0fff4" : "#e8fce8" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#2a6a3a", marginBottom: 4 }}>
                  🏗️ Min tomt — {lot.area} m² · {lot.districtName}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={chosen}
                    onChange={(e) => setLotBuildType({ ...lotBuildType, [lot.id]: e.target.value as PropTypeKey })}
                    style={{ fontSize: 11, padding: "3px 6px", borderRadius: 5, border: "1px solid #ddd" }}
                  >
                    {Object.entries(PROP_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} – {msek(lot.area * v.buildCostM2)} ({v.buildMonths}m)</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: "#666" }}>HDP: {msek(down)}</span>
                  <button
                    style={{ ...S.miniActionBtn, background: canBuild ? BURGUNDY : "#aaa", cursor: canBuild ? "pointer" : "default" }}
                    disabled={!canBuild}
                    onClick={() => dispatch({ type: "BUILD", id: lot.id, propType: chosen })}
                  >
                    Bygg
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
