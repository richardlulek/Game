/* ============================================================
   Marknadspanel – levande objektmarknad med filter, sortering
   och mäklarknapp. Objekt trillar in varje månad och utgår
   om de inte köps.
   ============================================================ */

import { useState } from "react";
import { kr, msek } from "../engine/format";
import { DISTRICTS, PROP_TYPES } from "../engine/data";
import type { GameAction, GameState, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";
import { C, FONTS } from "../styles/tokens";
import { ListingCard } from "./ListingCard";
import { propAnnualOpex, propPotentialRent } from "../engine/property";

interface MarketPanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

type SortKey = "age" | "price_asc" | "price_desc" | "condition" | "yield";

const SORT_LABELS: Record<SortKey, string> = {
  age:        "Äldst först",
  price_asc:  "Pris ↑",
  price_desc: "Pris ↓",
  condition:  "Bäst skick",
  yield:      "Direktavk.",
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
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={S.marketBar}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Objekt till salu ({state.listings.length})
          </span>
          {urgentCount > 0 && (
            <span style={{ fontSize: 11, color: C.negative, fontWeight: 700 }}>
              ⚠ {urgentCount} objekt utgår inom 1 månad
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button
            style={{
              ...S.smallBtn,
              background: canBroker ? C.wood : "#9a8f7a",
              color: canBroker ? C.brassBright : "#e8e0d0",
              cursor: canBroker ? "pointer" : "default",
              fontSize: 12,
            }}
            disabled={!canBroker}
            onClick={() => dispatch({ type: "HIRE_BROKER" })}
          >
            🔍 Anlita mäklare · {msek(75_000)}
          </button>
          <span style={{ fontSize: 10, color: C.inkSoft }}>
            Off-market objekt · betalas direkt
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
          Alla distrikt
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
        <div style={S.empty}>
          Inga objekt på marknaden just nu — nya objekt trillar in varje månad, eller{" "}
          anlita en mäklare för att hitta off-market affärer.
        </div>
      )}

      {/* ── Objektkort ───────────────────────────────────────── */}
      {filtered.length === 0 && state.listings.length > 0 && (
        <div style={S.empty}>
          Inga objekt matchar ditt filter. Prova att ändra distrikt eller typ.
        </div>
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
        background: "#f3ead3",
        border: `1px solid ${C.brassDim}55`,
        borderRadius: 5,
        fontSize: 11,
        color: C.inkSoft,
        lineHeight: 1.6,
      }}>
        <strong style={{ color: C.ink }}>Hur marknaden fungerar:</strong>{" "}
        Nya objekt tillkommer varje månad och säljs automatiskt om de inte köps i tid.
        Objekt markerade med varning utgår snart.
        Anlita en mäklare (75 000 kr) för att få tillgång till off-market objekt som{" "}
        inte syns för konkurrenterna. Alternativt, lägg ett lägre bud med "Lägg bud"-knappen
        på varje kort.
      </div>
    </div>
  );
}
