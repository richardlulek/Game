import { Fragment, useState } from "react";
import { DISTRICTS, PROP_TYPES } from "../engine/data";
import { msek, kr, pct } from "../engine/format";
import { pendingWork, propMarketValue, propNOI, propYieldOnCost } from "../engine/property";
import { interestLabel, packageStats } from "../engine/selling";
import type { GameAction, GameState, GlobalManagerSettings } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { C, FONTS, BURGUNDY } from "../styles/tokens";
import { PortfolioCard } from "./PortfolioCard";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

type SortKey = "value" | "yield" | "condition" | "noi" | "vacant";

const DISTRICT_OPTIONS = ["All", ...DISTRICTS.map((d) => d.name)];
const TYPE_OPTIONS = ["All", ...Object.values(PROP_TYPES).map((t) => t.label)];

function condColor(c: number): string {
  if (c >= 70) return C.positive;
  if (c >= 40) return C.gold;
  return C.negative;
}

export function PortfolioTable({ state, dispatch }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  // Klick på en rad fäller ut fastighetens fullständiga hantering (bred layout).
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [districtFilter, setDistrictFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  // Paketförsäljning: bocka för fastigheter och annonsera som portfölj.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pkgAskPct, setPkgAskPct] = useState(102);
  const toggleSelect = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const gm: GlobalManagerSettings = state.globalManager ?? {
    active: false,
    minCondition: 45,
    minTenantQuality: 0.8,
    rentTargetPct: 1.0,
  };
  const requestOpen = useUiStore((s) => s.requestOpen);
  const gmCost = 15000 + state.portfolio.length * 1500;

  // Filter
  let rows = state.portfolio.filter((p) => {
    if (districtFilter !== "All" && p.districtName !== districtFilter) return false;
    if (typeFilter !== "All" && p.typeLabel !== typeFilter) return false;
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

  const lowCond = state.portfolio.filter(
    (p) => p.condition < 50 && p.status === "klar" && !pendingWork(p, "underhåll"),
  );

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      {/* ── Portföljdirektör: statusspegel – styrs i Policy-fliken ── */}
      <div style={{
        background: C.wood,
        border: `1px solid ${C.brass}`,
        borderRadius: 8,
        padding: "12px 20px",
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 700, color: C.brassBright }}>
          Portfolio director
        </span>
        {gm.active ? (
          <span style={{ fontSize: 12.5, color: C.creamSoft }}>
            ✓ Active · maintenance below condition {gm.minCondition} · rent target {pct(gm.rentTargetPct)} ·
            quality ≥ {gm.minTenantQuality > 0 ? gm.minTenantQuality.toFixed(2) : "all"} · <strong style={{ color: C.gold }}>{kr(gmCost)}/mo</strong>
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.creamSoft }}>
            Inactive — handles leasing and maintenance for the whole portfolio ({kr(gmCost)}/mo).
          </span>
        )}
        <button
          onClick={() => requestOpen("policy")}
          style={{
            marginLeft: "auto", background: BURGUNDY, color: C.brassBright, border: "none",
            borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          Manage in Policy →
        </button>
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
          Maintain all below condition &lt; 50 ({lowCond.length})
        </button>
        {/* Med direktör aktiv är förvaltare på alla bara dubbla arvoden –
            egen förvaltare behövs enbart för avvikande instruktioner. */}
        {!gm.active && (
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
            Activate manager on all
          </button>
        )}
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
          {rows.length} of {state.portfolio.length} properties
        </span>
      </div>

      {/* ── Säljpaket: aktiva annonser + skapa nytt ur urvalet ────── */}
      {(state.salePackages ?? []).length > 0 && (
        <div style={{ background: C.woodDark, border: `1px solid ${C.brass}55`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            📦 Active sale packages
          </div>
          {(state.salePackages ?? []).map((pkg) => {
            const st = packageStats(pkg, state);
            const il = interestLabel(st.chance);
            return (
              <div key={pkg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12.5, color: C.parchment }}>
                <span>
                  <strong>{pkg.name}</strong> · {pkg.propertyIds.length} properties · asking {msek(pkg.ask)}
                  {" · "}value {msek(st.value)} (package premium +{Math.round((st.premium - 1) * 100)}%)
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
                  <span style={{ color: il.color, fontWeight: 700, fontSize: 11.5 }}>{il.label}</span>
                  <button
                    style={{ background: "transparent", border: `1px solid ${C.brass}66`, color: C.creamSoft, borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
                    onClick={() => dispatch({ type: "UNLIST_PACKAGE", packageId: pkg.id })}
                  >
                    Withdraw
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {selected.size >= 2 && (() => {
        const props = state.portfolio.filter((p) => selected.has(p.id) && p.status === "klar" && !p.forSale);
        const value = props.reduce((a, p) => a + propMarketValue(p, state), 0);
        const ask = Math.round((value * pkgAskPct) / 100);
        return (
          <div style={{ background: C.woodDark, border: `1px solid ${C.brass}`, borderRadius: 6, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: C.parchment }}>
              <strong>{props.length} selected</strong> · value {msek(value)}
            </span>
            <input
              type="range" min={92} max={118} step={1}
              value={pkgAskPct}
              onChange={(e) => setPkgAskPct(+e.target.value)}
              style={{ flex: 1, minWidth: 120, accentColor: C.brass }}
            />
            <span style={{ fontSize: 12.5, color: C.brassBright, fontWeight: 700 }}>
              Asking {msek(ask)} ({pkgAskPct}%)
            </span>
            <button
              style={{ background: BURGUNDY, color: C.brassBright, border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              disabled={props.length < 2}
              onClick={() => {
                dispatch({ type: "LIST_PACKAGE", ids: props.map((p) => p.id), ask });
                setSelected(new Set());
              }}
            >
              📦 Create sale package
            </button>
          </div>
        );
      })()}

      {/* ── Tabell ───────────────────────────────────────────────── */}
      {state.portfolio.length === 0 ? (
        <div style={{ color: C.creamSoft, fontSize: 13, padding: 20 }}>
          No properties in the portfolio yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.woodDark, borderBottom: `1px solid ${C.brass}` }}>
                <th style={{ ...thStyle, width: 30 }} title="Select for sale package">📦</th>
                <th style={thStyle}>Property</th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("value")}>
                  Market value{sortIndicator("value")}
                </th>
                <th
                  style={{ ...thStyle, cursor: "pointer" }}
                  onClick={() => toggleSort("yield")}
                  title="Yield on cost: net operating income / (purchase price + improvements and costs)"
                >
                  Yield on cost %{sortIndicator("yield")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("condition")}>
                  Condition{sortIndicator("condition")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("noi")}>
                  NOI/yr{sortIndicator("noi")}
                </th>
                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("vacant")}>
                  Units{sortIndicator("vacant")}
                </th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const mv = propMarketValue(p, state);
                const noi = propNOI(p, state);
                const yld = propYieldOnCost(p, state);
                const vacant = p.capacity - p.tenants.length;
                const isOpen = expandedId === p.id;
                return (
                  <Fragment key={p.id}>
                  <tr
                    style={{
                      background: isOpen ? C.woodDark : i % 2 === 0 ? C.feltDark : C.felt,
                      borderBottom: `1px solid ${C.woodLight}`,
                      height: 40,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {p.status === "klar" && !p.forSale ? (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          style={{ accentColor: C.brass, cursor: "pointer" }}
                        />
                      ) : p.forSale ? (
                        <span title={p.forSale.packageId != null ? "In sale package" : "For sale"} style={{ fontSize: 11 }}>🏷️</span>
                      ) : null}
                    </td>
                    <td
                      style={{ ...tdStyle, cursor: "pointer" }}
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                      title="Click to manage the property"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: C.brass, fontSize: 11, width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: C.parchment }}>{p.typeLabel}</div>
                          <div style={{ fontSize: 11, color: C.creamSoft }}>{p.districtName}</div>
                        </div>
                      </div>
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
                        {p.status === "bygger" ? `Build ${p.buildLeft}m` : p.managed ? "Managed" : "Manual"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {p.condition < 50 && p.status === "klar" && (
                        pendingWork(p, "underhåll") ? (
                          <span style={{ fontSize: 11, color: C.brass }}>⏳ in progress</span>
                        ) : (
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
                            Maintain
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} style={{ padding: 0, background: C.feltDark, borderBottom: `2px solid ${C.brass}` }}>
                        <div style={{ padding: 12 }}>
                          <PortfolioCard p={p} state={state} dispatch={dispatch} wide />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
