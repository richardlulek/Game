import { Fragment, useState } from "react";
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

const DISTRICT_OPTIONS = ["Alla", "Centrum", "Hamnen", "Industriområdet", "Förorten", "Villakullen"];
const TYPE_OPTIONS = ["Alla", "Bostadshus", "Kontor", "Butik", "Industri/Lager"];

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
  const [districtFilter, setDistrictFilter] = useState("Alla");
  const [typeFilter, setTypeFilter] = useState("Alla");
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
          Portföljdirektör
        </span>
        {gm.active ? (
          <span style={{ fontSize: 12.5, color: C.creamSoft }}>
            ✓ Aktiv · underhåll under skick {gm.minCondition} · hyresmål {pct(gm.rentTargetPct)} ·
            kvalitet ≥ {gm.minTenantQuality > 0 ? gm.minTenantQuality.toFixed(2) : "alla"} · <strong style={{ color: C.gold }}>{kr(gmCost)}/mån</strong>
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: C.creamSoft }}>
            Inaktiv — sköter uthyrning och underhåll för hela beståndet ({kr(gmCost)}/mån).
          </span>
        )}
        <button
          onClick={() => requestOpen("policy")}
          style={{
            marginLeft: "auto", background: BURGUNDY, color: C.brassBright, border: "none",
            borderRadius: 5, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          Styr i Policy →
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
          Underhåll alla med skick &lt; 50 ({lowCond.length} st)
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
            Aktivera förvaltare på alla
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
          {rows.length} av {state.portfolio.length} fastigheter
        </span>
      </div>

      {/* ── Säljpaket: aktiva annonser + skapa nytt ur urvalet ────── */}
      {(state.salePackages ?? []).length > 0 && (
        <div style={{ background: C.woodDark, border: `1px solid ${C.brass}55`, borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            📦 Aktiva säljpaket
          </div>
          {(state.salePackages ?? []).map((pkg) => {
            const st = packageStats(pkg, state);
            const il = interestLabel(st.chance);
            return (
              <div key={pkg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "4px 0", fontSize: 12.5, color: C.parchment }}>
                <span>
                  <strong>{pkg.name}</strong> · {pkg.propertyIds.length} fastigheter · utgångspris {msek(pkg.ask)}
                  {" · "}värde {msek(st.value)} (paketpremie +{Math.round((st.premium - 1) * 100)} %)
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
                  <span style={{ color: il.color, fontWeight: 700, fontSize: 11.5 }}>{il.label}</span>
                  <button
                    style={{ background: "transparent", border: `1px solid ${C.brass}66`, color: C.creamSoft, borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
                    onClick={() => dispatch({ type: "UNLIST_PACKAGE", packageId: pkg.id })}
                  >
                    Återkalla
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
              <strong>{props.length} valda</strong> · värde {msek(value)}
            </span>
            <input
              type="range" min={92} max={118} step={1}
              value={pkgAskPct}
              onChange={(e) => setPkgAskPct(+e.target.value)}
              style={{ flex: 1, minWidth: 120, accentColor: C.brass }}
            />
            <span style={{ fontSize: 12.5, color: C.brassBright, fontWeight: 700 }}>
              Utgångspris {msek(ask)} ({pkgAskPct} %)
            </span>
            <button
              style={{ background: BURGUNDY, color: C.brassBright, border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              disabled={props.length < 2}
              onClick={() => {
                dispatch({ type: "LIST_PACKAGE", ids: props.map((p) => p.id), ask });
                setSelected(new Set());
              }}
            >
              📦 Skapa säljpaket
            </button>
          </div>
        );
      })()}

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
                <th style={{ ...thStyle, width: 30 }} title="Välj för säljpaket">📦</th>
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
                        <span title={p.forSale.packageId != null ? "I säljpaket" : "Till salu"} style={{ fontSize: 11 }}>🏷️</span>
                      ) : null}
                    </td>
                    <td
                      style={{ ...tdStyle, cursor: "pointer" }}
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                      title="Klicka för att hantera fastigheten"
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
                        {p.status === "bygger" ? `Bygg ${p.buildLeft}m` : p.managed ? "Förvaltas" : "Manuell"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {p.condition < 50 && p.status === "klar" && (
                        pendingWork(p, "underhåll") ? (
                          <span style={{ fontSize: 11, color: C.brass }}>⏳ pågår</span>
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
                            Underhåll
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
