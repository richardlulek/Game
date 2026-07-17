/* ============================================================
   Marknadspanel – levande objektmarknad med filter, sortering
   och mäklarknapp. Objekt trillar in varje månad och utgår
   om de inte köps.
   ============================================================ */

import { useState } from "react";
import { msek } from "../engine/format";
import { DISTRICTS, PROP_TYPES } from "../engine/data";
import type { GameAction, GameState, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";
import { C, FONTS } from "../styles/tokens";
import { ListingCard } from "./ListingCard";
import { EmptyState } from "./ui";
import { propAnnualOpex, propPotentialRent } from "../engine/property";

interface MarketPanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

type SortKey = "age" | "price_asc" | "price_desc" | "condition" | "yield";

const SORT_LABELS: Record<SortKey, string> = {
  age:        "Oldest first",
  price_asc:  "Price ↑",
  price_desc: "Price ↓",
  condition:  "Best condition",
  yield:      "Cap rate",
};

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 4,
  border: `1px solid ${active ? C.brass : C.brassDim + "88"}`,
  background: active ? C.wood : "transparent",
  color: active ? C.brassBright : C.inkSoft,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export function MarketPanel({ state, dispatch }: MarketPanelProps) {
  const [districtFilter, setDistrictFilter] = useState<string>("alla");
  const [typeFilter, setTypeFilter]         = useState<string>("alla");
  const [sortBy, setSortBy]                 = useState<SortKey>("age");

  const canBroker = state.cash >= 75_000 && !state.gameOver;

  const now = state.year * 12 + state.month;

  // ── Världsstatistik ─────────────────────────────────────────────
  const worldTotal  = state.worldTotal ?? 0;
  const playerOwned = state.portfolio.filter((p) => p.status === "klar").length;
  const rivalOwned  = state.competitors.reduce((a, c) => a + (c.portfolio?.length ?? 0), 0);
  const onMarket    = state.listings.length;
  const offMarket   = state.worldPool?.length ?? 0;

  // ── Filtrera ────────────────────────────────────────────────
  const filtered = state.listings
    .filter((p) =>
      (districtFilter === "alla" || p.district === districtFilter) &&
      (typeFilter === "alla"     || p.type     === typeFilter),
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "price_asc":  return a.askPrice - b.askPrice;
        case "price_desc": return b.askPrice - a.askPrice;
        case "condition":  return b.condition - a.condition;
        case "yield": {
          const yA = (propPotentialRent(a, state) - propAnnualOpex(a, state)) / a.askPrice;
          const yB = (propPotentialRent(b, state) - propAnnualOpex(b, state)) / b.askPrice;
          return yB - yA;
        }
        case "age":
        default:
          // Äldst (snarast utgångna) högst upp → skapar urgency
          return (a.expiresMonth ?? 9999) - (b.expiresMonth ?? 9999);
      }
    });

  const urgentCount = state.listings.filter(
    (p) => (p.expiresMonth ?? 9999) - now <= 1,
  ).length;

  return (
    <div>
      {/* ── Världsöversikt ──────────────────────────────────── */}
      {worldTotal > 0 && (
        <div style={{
          display: "flex",
          gap: 0,
          border: `1px solid ${C.brass}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 14,
          fontSize: 12,
        }}>
          {[
            { label: "Yours",         value: playerOwned, color: C.green },
            { label: "For sale",      value: onMarket,    color: C.gold },
            { label: "Competitors",   value: rivalOwned,  color: C.burgundy },
            { label: "Off-market",    value: offMarket,   color: C.inkSoft },
          ].map((seg) => (
            <div key={seg.label} style={{
              flex: 1,
              padding: "8px 10px",
              background: C.parchment,
              borderRight: `1px solid ${C.brass}55`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.heading, color: seg.color }}>
                {seg.value}
              </div>
              <div style={{ color: C.inkSoft, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {seg.label}
              </div>
            </div>
          ))}
          <div style={{ flex: 1, padding: "8px 10px", background: C.wood, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.heading, color: C.brassBright }}>
              {worldTotal}
            </div>
            <div style={{ color: C.creamSoft, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Total
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={S.marketBar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Properties for sale ({state.listings.length})
          </span>
          {urgentCount > 0 && (
            <span style={{ fontSize: 11, color: C.negative, fontWeight: 700 }}>
              ⚠ {urgentCount} listings expire within 1 month
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button
            style={{
              ...S.smallBtn,
              background: canBroker ? C.wood : C.brassDim,
              color: canBroker ? C.brassBright : C.creamSoft,
              cursor: canBroker ? "pointer" : "default",
              opacity: canBroker ? 1 : 0.7,
              fontSize: 12,
            }}
            disabled={!canBroker}
            onClick={() => dispatch({ type: "HIRE_BROKER" })}
          >
            🔍 Hire broker · {msek(75_000)}
          </button>
          <span style={{ fontSize: 10, color: C.inkSoft }}>
            Off-market listings · paid immediately
          </span>
        </div>
      </div>

      {/* ── Filter + sortering ──────────────────────────────── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "8px 0 12px",
        alignItems: "center",
      }}>
        {/* Distriktsfilter */}
        <button style={filterBtn(districtFilter === "alla")} onClick={() => setDistrictFilter("alla")}>
          All districts
        </button>
        {DISTRICTS.map((d) => (
          <button
            key={d.id}
            style={filterBtn(districtFilter === d.id)}
            onClick={() => setDistrictFilter(districtFilter === d.id ? "alla" : d.id)}
          >
            {d.name}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: C.brassDim + "55", margin: "0 4px" }} />

        {/* Typfilter */}
        {(Object.entries(PROP_TYPES) as [PropTypeKey, { label: string }][]).map(([k, v]) => (
          <button
            key={k}
            style={filterBtn(typeFilter === k)}
            onClick={() => setTypeFilter(typeFilter === k ? "alla" : k)}
          >
            {v.label}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: C.brassDim + "55", margin: "0 4px" }} />

        {/* Sortering */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          style={{
            ...S.select,
            fontSize: 12,
            padding: "5px 10px",
            height: 32,
            minWidth: 130,
          }}
        >
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      {/* ── Nyhetsflöde-tips ─────────────────────────────────── */}
      {state.listings.length === 0 && (
        <EmptyState icon="🏙️">
          No properties on the market right now — new listings drop in every month, or{" "}
          hire a broker to find off-market deals.
        </EmptyState>
      )}

      {/* ── Objektkort ───────────────────────────────────────── */}
      {filtered.length === 0 && state.listings.length > 0 && (
        <EmptyState icon="🔍">
          No properties match your filter. Try changing district or type.
        </EmptyState>
      )}

      <div style={S.grid}>
        {filtered.map((p) => (
          <ListingCard key={p.id} p={p} state={state} dispatch={dispatch} />
        ))}
      </div>

      {/* ── Marknadsinfo ────────────────────────────────────────*/}
      <div style={{
        marginTop: 16,
        padding: "10px 14px",
        background: C.cream,
        border: `1px solid ${C.brassDim}55`,
        borderRadius: 6,
        fontSize: 11,
        color: C.inkSoft,
        lineHeight: 1.6,
      }}>
        <strong style={{ color: C.ink }}>How the market works:</strong>{" "}
        New properties appear every month and sell automatically if not bought in time.
        Listings flagged with a warning expire soon.
        Hire a broker ($75,000) to access off-market properties that{" "}
        competitors can't see. Alternatively, place a lower bid with the "Place bid" button
        on each card.
      </div>
    </div>
  );
}
