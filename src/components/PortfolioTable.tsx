import { useState } from "react";
import { msek, kr, pct } from "../engine/format";
import { propMarketValue, propNOI, propYieldOnCost } from "../engine/property";
import type { GameAction, GameState, GlobalManagerSettings } from "../engine/types";
import { C, FONTS, BURGUNDY } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

type SortKey = "value" | "yield" | "condition" | "noi" | "vacant";

const DISTRICT_OPTIONS = ["Alla", "Centrum", "Hamnen", "Industriområdet", "Förorten", "Villakullen"];
const TYPE_OPTIONS = ["Alla", "Bostadshus", "Kontor", "Butik", "Industri/Lager"];

function qualityLabel(q: number): string {
  if (q < 0.8) return "Låg";
  if (q < 1.4) return "Medel";
  return "Hög";
}

function condColor(c: number): string {
  if (c >= 70) return C.positive;
  if (c >= 40) return C.gold;
  return C.negative;
}

export function PortfolioTable({ state, dispatch }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  const [districtFilter, setDistrictFilter] = useState("Alla");
  const [typeFilter, setTypeFilter] = useState("Alla");

  const gm: GlobalManagerSettings = state.globalManager ?? {
    active: false,
    minCondition: 40,
    minTenantQuality: 0.8,
    rentTargetPct: 1.0,
  };

  const [localGm, setLocalGm] = useState<GlobalManagerSettings>(gm);

  function updateGm(patch: Partial<GlobalManagerSettings>) {
    const next = { ...localGm, ...patch };
    setLocalGm(next);
    dispatch({ type: "SET_GLOBAL_MANAGER", settings: next });
  }

  const gmCost = 15000 + state.portfolio.length * 1500;

  // Filter
  let rows = state.portfolio.filter((p) => {
    if (districtFilter !== "Alla" && p.districtName !== districtFilter) return false;
    if (typeFilter !== "Alla" && p.typeLabel !== typeFilter) return false;
    return true;
  });

  // Sort
  rows = [...rows].sort((a, b) => {
    let va = 0, vb = 0;
    switch (sortKey) {
      case "value":
        va = propMarketValue(a, state);
        vb = propMarketValue(b, state);
        break;
      case "yield":
        va = propYieldOnCost(a, state);
        vb = propYieldOnCost(b, state);
        break;
      case "condition":
        va = a.condition;
        vb = b.condition;
        break;
      case "noi":
        va = propNOI(a, state);
        vb = propNOI(b, state);
        break;
      case "vacant":
        va = a.capacity - a.tenants.length;
        vb = b.capacity - b.tenants.length;
        break;
    }
    return sortAsc ? va - vb : vb - va;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return " ↕";
    return sortAsc ? " ↑" : " ↓";
  }

  const lowCond = state.portfolio.filter((p) => p.condition < 50 && p.status === "klar");

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      {/* ── Global portföljdirektör ─────────────────────────────── */}
      <div style={{
        background: C.wood,
        border: `1px solid ${C.brass}`,
        borderRadius: 8,
        padding: "16px 20px",
        marginBottom: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <span style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 700, color: C.brassBright }}>
            Portföljdirektör
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={localGm.active}
              onChange={(e) => updateGm({ active: e.target.checked })}
              style={{ accentColor: BURGUNDY, width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: localGm.active ? C.brassBright : C.creamSoft }}>
              {localGm.active ? "Aktiv" : "Inaktiv"}
            </span>
          </label>
          <span style={{ fontSize: 12, color: C.creamSoft, marginLeft: "auto" }}>
            Månadskostnad: <strong style={{ color: C.gold }}>{kr(gmCost)}</strong>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: C.creamSoft, display: "block", marginBottom: 4 }}>
              Auto-underhåll under skick {localGm.minCondition}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min={0} max={100} step={5}
                value={localGm.minCondition}
                onChange={(e) => updateGm({ minCondition: +e.target.value })}
                style={{ flex: 1, accentColor: C.brass }}
              />
              <span style={{ minWidth: 28, textAlign: "right", fontSize: 13, color: C.brassBright }}>
                {localGm.minCondition}
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: C.creamSoft, display: "block", marginBottom: 4 }}>
              Min. hyresgästkvalitet: {qualityLabel(localGm.minTenantQuality)}
              {" "}({localGm.minTenantQuality.toFixed(1)})
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min={0} max={2} step={0.1}
                value={localGm.minTenantQuality}
                onChange={(e) => updateGm({ minTenantQuality: +e.target.value })}
                style={{ flex: 1, accentColor: C.brass }}
              />
              <span style={{ minWidth: 28, textAlign: "right", fontSize: 13, color: C.brassBright }}>
                {localGm.minTenantQuality.toFixed(1)}
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: C.creamSoft, display: "block", marginBottom: 4 }}>
              Hyresmål: {pct(localGm.rentTargetPct)}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="range" min={0.8} max={1.3} step={0.05}
                value={localGm.rentTargetPct}
                onChange={(e) => updateGm({ rentTargetPct: +e.target.value })}
                style={{ flex: 1, accentColor: C.brass }}
              />
              <span style={{ minWidth: 36, textAlign: "right", fontSize: 13, color: C.brassBright }}>
                {pct(localGm.rentTargetPct)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bulkåtgärder ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => {
            lowCond.forEach((p) => dispatch({ type: "MAINTAIN", id: p.id }));
          }}
          disabled={lowCond.length === 0}
          style={{
            background: lowCond.length > 0 ? C.green : C.woodDark,
            color: C.parchment,
            border: `1px solid ${C.brass}`,
            borderRadius: 5,
            padding: "7px 14px",
            fontSize: 12,
            cursor: lowCond.length > 0 ? "pointer" : "default",
            opacity: lowCond.length > 0 ? 1 : 0.5,
          }}
        >
          Underhåll alla med skick &lt; 50 ({lowCond.length} st)
        </button>
        <button
          onClick={() => {
            state.portfolio
              .filter((p) => !p.managed)
              .forEach((p) => dispatch({ type: "TOGGLE_MANAGER", id: p.id }));
          }}
          style={{
            background: C.woodLight,
            color: C.parchment,
            border: `1px solid ${C.brass}`,
            borderRadius: 5,
            padding: "7px 14px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Aktivera förvaltare på alla
        </button>
      </div>

      {/* ── Filter ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          style={{ background: C.woodDark, color: C.parchment, border: `1px solid ${C.brass}`, borderRadius: 4, padding: "5px 10px", fontSize: 12 }}
        >
          {DISTRICT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ background: C.woodDark, color: C.parchment, border: `1px solid ${C.brass}`, borderRadius: 4, padding: "5px 10px", fontSize: 12 }}
        >
          {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.creamSoft, alignSelf: "center" }}>
          {rows.length} av {state.portfolio.length} fastigheter
        </span>
      </div>

      {/* ── Tabell ───────────────────────────────────────────────── */}
      {state.portfolio.length === 0 ? (
        <div style={{ color: C.creamSoft, fontSize: 13, padding: 20 }}>
          Inga fastigheter i portföljen ännu.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.woodDark, borderBottom: `1px solid ${C.brass}` }}>
                <th style={thStyle}>Fastighet</th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("value")}>
                  Marknadsvärde{sortIndicator("value")}
                </th>
                <th
                  style={{ ...thStyle, cursor: "pointer" }}
                  onClick={() => toggleSort("yield")}
                  title="Yield on cost: driftnetto / (inköpspris + förbättringar och omkostnader)"
                >
                  Yield on cost %{sortIndicator("yield")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("condition")}>
                  Skick{sortIndicator("condition")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("noi")}>
                  NOI/år{sortIndicator("noi")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("vacant")}>
                  Platser{sortIndicator("vacant")}
                </th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const mv = propMarketValue(p, state);
                const noi = propNOI(p, state);
                const yld = propYieldOnCost(p, state);
                const vacant = p.capacity - p.tenants.length;
                return (
                  <tr
                    key={p.id}
                    style={{
                      background: i % 2 === 0 ? C.feltDark : C.felt,
                      borderBottom: `1px solid ${C.woodLight}`,
                      height: 40,
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: C.parchment }}>{p.typeLabel}</div>
                      <div style={{ fontSize: 11, color: C.creamSoft }}>{p.districtName}</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{msek(mv)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: yld >= 0.05 ? C.positive : yld >= 0.03 ? C.gold : C.negative }}>
                      {pct(yld)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{ color: condColor(p.condition), fontWeight: 700 }}>{Math.round(p.condition)}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: noi >= 0 ? C.positiveBright : C.negativeBright }}>
                      {kr(noi)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{ color: vacant > 0 ? C.gold : C.positive }}>
                        {p.tenants.length}/{p.capacity}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: p.status === "bygger" ? C.gold : p.managed ? C.positive : C.creamSoft,
                        background: C.woodDark,
                        borderRadius: 3, padding: "2px 6px",
                      }}>
                        {p.status === "bygger" ? `Bygg ${p.buildLeft}m` : p.managed ? "Förvaltas" : "Manuell"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {p.condition < 50 && p.status === "klar" && (
                        <button
                          onClick={() => dispatch({ type: "MAINTAIN", id: p.id })}
                          style={{
                            background: C.burgundy,
                            color: C.parchment,
                            border: "none",
                            borderRadius: 4,
                            padding: "4px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Underhåll
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontFamily: FONTS.heading,
  fontSize: 12,
  fontWeight: 700,
  color: C.brassBright,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  verticalAlign: "middle",
};
