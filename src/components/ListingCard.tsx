import { kr, msek, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { BuildingArt } from "./BuildingArt";
import { CondBar } from "./CondBar";

interface ListingCardProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

// Yield-guide per fastighetstyp
const TYPE_GUIDE: Record<string, { yield: string; risk: string; color: string }> = {
  bostad:   { yield: "~5 %",   risk: "Låg risk",   color: "#27660a" },
  kontor:   { yield: "~6 %",   risk: "Medel risk",  color: "#b07010" },
  butik:    { yield: "~7 %",   risk: "Hög risk",    color: "#b04010" },
  industri: { yield: "~5,5 %", risk: "Låg–medel",  color: "#5a8a10" },
};

export function ListingCard({ p, state, dispatch }: ListingCardProps) {
  const terms     = loanTerms(state);
  const noi       = propPotentialRent(p, state) - propAnnualOpex(p, state);
  const yld       = noi / p.askPrice;
  const down      = p.askPrice * (1 - terms.maxLtv);
  const loan      = p.askPrice - down;
  const monthlyInterest = (loan * terms.rate) / 100 / 12;
  const monthlyCF = noi / 12 - monthlyInterest;
  const ok        = state.cash >= down && !state.gameOver;
  const guide     = TYPE_GUIDE[p.type];

  return (
    <div style={S.card}>
      <div style={listingBanner}>
        <BuildingArt p={p} />
        <div style={listingOverlay}>
          <span style={S.badge}>{p.typeLabel}</span>
          <span style={listingDistrict}>{p.districtName}</span>
        </div>
      </div>

      <div style={S.cardValue}>{msek(p.askPrice)}</div>

      <div style={S.cardRow}>
        <span>Yta</span>
        <strong>{p.area} m²</strong>
      </div>
      <div style={S.cardRow}>
        <span>Skick</span>
        <CondBar c={p.condition} />
      </div>
      <div style={S.cardRow}>
        <span>Kapacitet</span>
        <strong>
          {p.tenants.length > 0
            ? `${p.tenants.length} av ${p.capacity} uthyrd${p.tenants.length > 1 ? "a" : ""}`
            : `${p.capacity} platser, vakant`}
        </strong>
      </div>

      {/* ── Lönsamhetsindikator ─────────────────────────────── */}
      <div style={profitBox(monthlyCF >= 0)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#666" }}>Est. kassaflöde/mån (vid {pct(terms.maxLtv)} LTV)</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: monthlyCF >= 0 ? "#27660a" : "#c0392b" }}>
            {monthlyCF >= 0 ? "+" : ""}{kr(Math.round(monthlyCF))}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Direktavkastning (NOI)</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: yld >= 0.05 ? "#27660a" : "#b07010" }}>
            {pct(yld)}
          </span>
        </div>
      </div>

      {/* ── Typ-guide ───────────────────────────────────────── */}
      {guide && (
        <div style={guideBox}>
          <span style={{ fontSize: 11, color: guide.color, fontWeight: 700 }}>
            {p.typeLabel}: typ {guide.yield} direktavk.
          </span>
          <span style={{ fontSize: 11, color: guide.color, marginLeft: 6 }}>{guide.risk}</span>
        </div>
      )}

      <div style={S.cardRow}>
        <span>Handpenning</span>
        <strong>{msek(down)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Lån</span>
        <strong>{msek(loan)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Ränta/mån</span>
        <strong style={{ color: "#c0392b" }}>−{kr(Math.round(monthlyInterest))}</strong>
      </div>

      <button
        style={{ ...S.buyBtn, ...(ok ? {} : S.btnDisabled) }}
        disabled={!ok}
        onClick={() => dispatch({ type: "BUY", id: p.id })}
      >
        {!ok && state.cash < down ? "Otillräcklig handpenning" : ok ? "Köp" : "Spelet slut"}
      </button>
    </div>
  );
}

const listingBanner: React.CSSProperties = {
  position: "relative", margin: "-16px -16px 10px",
  borderRadius: "12px 12px 0 0", overflow: "hidden", maxHeight: 150,
};
const listingOverlay: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 0,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "7px 12px",
  background: "linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0))",
};
const listingDistrict: React.CSSProperties = {
  fontSize: 12, color: "#fff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.5)",
};

const profitBox = (positive: boolean): React.CSSProperties => ({
  margin: "8px 0",
  padding: "8px 10px",
  borderRadius: 8,
  background: positive ? "#eef5ee" : "#fdf0ee",
  border: `1px solid ${positive ? "#27660a33" : "#c0392b33"}`,
});

const guideBox: React.CSSProperties = {
  fontSize: 11,
  padding: "5px 8px",
  background: "#f8f5f2",
  borderRadius: 6,
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
};
