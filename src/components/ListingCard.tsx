import { useState } from "react";
import { formatMonthYear } from "../engine/date";
import { kr, msek, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY, C, FONTS } from "../styles/tokens";
import { BuildingArt } from "./BuildingArt";
import { CondBar } from "./CondBar";

interface ListingCardProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const TYPE_GUIDE: Record<string, { yield: string; risk: string; color: string }> = {
  bostad:   { yield: "~5%",    risk: "Low risk",    color: C.positive },
  kontor:   { yield: "~6%",    risk: "Medium risk", color: "#9a6a10" },
  butik:    { yield: "~7%",    risk: "High risk",   color: "#a8431f" },
  industri: { yield: "~5.5%",  risk: "Low–medium",  color: C.green },
};

function bidEstimate(ratio: number): { label: string; color: string } {
  if (ratio >= 0.97) return { label: "Very likely", color: C.positive };
  if (ratio >= 0.92) return { label: "Likely",        color: C.positive };
  if (ratio >= 0.85) return { label: "Uncertain",     color: "#9a6a10" };
  if (ratio >= 0.78) return { label: "Low chance",    color: "#a8431f" };
  return { label: "Very low", color: C.negative };
}

const ageChipStyle = (monthsLeft: number | null): React.CSSProperties => ({
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  marginBottom: 6,
  display: "flex",
  justifyContent: "space-between",
  background:
    monthsLeft !== null && monthsLeft <= 1 ? "#fde8e8" :
    monthsLeft !== null && monthsLeft <= 2 ? "#e7edff" : "#eef5ee",
  color:
    monthsLeft !== null && monthsLeft <= 1 ? C.negative :
    monthsLeft !== null && monthsLeft <= 2 ? "#9a6a10" : C.inkSoft,
  border: `1px solid ${monthsLeft !== null && monthsLeft <= 1 ? C.negative + "44" : "transparent"}`,
});

export function ListingCard({ p, state, dispatch }: ListingCardProps) {
  const now         = state.year * 12 + state.month;
  const monthsOnMkt = p.listedMonth !== undefined ? Math.max(0, now - p.listedMonth) : null;
  const monthsLeft  = p.expiresMonth !== undefined && p.expiresMonth < 9999 ? p.expiresMonth - now : null;
  const terms     = loanTerms(state);
  const noi       = propPotentialRent(p, state) - propAnnualOpex(p, state);
  const yld       = noi / p.askPrice;
  const down      = p.askPrice * (1 - terms.maxLtv);
  const loan      = p.askPrice - down;
  const monthlyInterest = (loan * terms.rate) / 100 / 12;
  const monthlyCF = noi / 12 - monthlyInterest;
  const ok        = state.cash >= down && !state.gameOver;
  const guide     = TYPE_GUIDE[p.type];

  const [bidding, setBidding] = useState(false);
  const minBid = Math.round(p.askPrice * 0.75);
  const [bid, setBid] = useState(Math.round(p.askPrice * 0.9));
  const bidDown = bid * (1 - terms.maxLtv);
  const est = bidEstimate(bid / p.askPrice);
  const canBid = state.cash >= bidDown && !state.gameOver;

  return (
    <div style={S.card}>
      <div style={listingBanner}>
        <BuildingArt p={p} month={state.month} />
        <div style={listingOverlay}>
          <span style={S.badge}>{p.typeLabel}</span>
          <span style={listingDistrict}>{p.districtName}</span>
        </div>
      </div>

      <div style={S.cardValue}>{msek(p.askPrice)}</div>

      {monthsOnMkt !== null && (
        <div style={ageChipStyle(monthsLeft)}>
          <span>{monthsOnMkt === 0 ? "New today" : `${monthsOnMkt} mo on market`}</span>
          {monthsLeft !== null && monthsLeft <= 2 && (
            <span style={{ fontWeight: 700 }}>
              {monthsLeft <= 0 ? "Expiring soon!" : `Expires in ${monthsLeft} mo`}
            </span>
          )}
        </div>
      )}

      {p.txHistory && p.txHistory.length > 0 && (
        <div style={{ marginBottom: 8, padding: "6px 8px", background: "#f7f3e8", borderRadius: 4, border: "1px solid #e8dfc5" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7b5a2e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
            Transaction history
          </div>
          {[...p.txHistory].reverse().slice(0, 3).map((tx, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", lineHeight: 1.6 }}>
              <span>{formatMonthYear(tx.month, tx.year)} · {tx.type} · {tx.party}</span>
              <span style={{ fontWeight: 700 }}>{msek(tx.price)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.cardRow}>
        <span>Area</span>
        <strong style={strong}>{p.area} m²</strong>
      </div>
      <div style={S.cardRow}>
        <span>Condition</span>
        <CondBar c={p.condition} />
      </div>
      <div style={S.cardRow}>
        <span>Capacity</span>
        <strong style={strong}>
          {p.tenants.length > 0
            ? `${p.tenants.length} of ${p.capacity} rented`
            : `${p.capacity} units, vacant`}
        </strong>
      </div>

      {/* ── Lönsamhetsindikator ─────────────────────────────── */}
      <div style={profitBox(monthlyCF >= 0)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.inkSoft }}>Est. cash flow/mo (at {pct(terms.maxLtv)} LTV)</span>
          <span style={{ fontWeight: 800, fontSize: 14, fontFamily: FONTS.heading, color: monthlyCF >= 0 ? C.positive : C.negative }}>
            {monthlyCF >= 0 ? "+" : ""}{kr(Math.round(monthlyCF))}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 11, color: C.inkSoft }}>Cap rate (NOI)</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: yld >= 0.05 ? C.positive : "#9a6a10" }}>
            {pct(yld)}
          </span>
        </div>
      </div>

      {guide && (
        <div style={guideBox}>
          <span style={{ fontSize: 11, color: guide.color, fontWeight: 700 }}>
            {p.typeLabel}: {guide.yield} cap rate
          </span>
          <span style={{ fontSize: 11, color: guide.color, marginLeft: 6 }}>· {guide.risk}</span>
        </div>
      )}

      <div style={S.cardRow}>
        <span>Down payment</span>
        <strong style={strong}>{msek(down)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Loan</span>
        <strong style={strong}>{msek(loan)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Interest/mo</span>
        <strong style={{ ...strong, color: C.negative }}>−{kr(Math.round(monthlyInterest))}</strong>
      </div>

      {/* ── Köp / Lägg bud ──────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          style={{ ...S.buyBtn, marginTop: 0, flex: 1, ...(ok ? {} : S.btnDisabled) }}
          disabled={!ok}
          onClick={() => dispatch({ type: "BUY", id: p.id })}
        >
          {!ok && state.cash < down ? "Too expensive" : "Buy at ask price"}
        </button>
        <button
          style={bidToggle(bidding)}
          disabled={state.gameOver}
          onClick={() => setBidding((b) => !b)}
        >
          {bidding ? "✕" : "Place bid"}
        </button>
      </div>

      {bidding && (
        <div style={bidPanel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 11, color: C.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
              Your bid
            </span>
            <span style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 17, color: BURGUNDY }}>
              {msek(bid)}
            </span>
          </div>
          <input
            type="range"
            min={minBid}
            max={p.askPrice}
            step={Math.max(10000, Math.round(p.askPrice / 40))}
            value={bid}
            onChange={(e) => setBid(+e.target.value)}
            style={{ width: "100%", accentColor: BURGUNDY, margin: "6px 0" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkSoft }}>
            <span>Accept chance: <strong style={{ color: est.color }}>{est.label}</strong></span>
            <span>Down payment {msek(bidDown)}</span>
          </div>
          <button
            style={{ ...S.buyBtn, width: "100%", ...(canBid ? {} : S.btnDisabled) }}
            disabled={!canBid}
            onClick={() => { dispatch({ type: "PLACE_BID", id: p.id, amount: bid }); setBidding(false); }}
          >
            Place bid {msek(bid)}
          </button>
          <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 5, textAlign: "center" }}>
            A lower bid saves money but may be rejected by the seller.
          </div>
        </div>
      )}
    </div>
  );
}

const strong: React.CSSProperties = { color: C.ink, fontFamily: FONTS.heading };

const listingBanner: React.CSSProperties = {
  position: "relative", margin: "-16px -16px 10px",
  borderRadius: "6px 6px 0 0", overflow: "hidden", maxHeight: 150,
  borderBottom: `2px solid ${C.brass}`,
};
const listingOverlay: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, bottom: 0,
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "7px 12px",
  background: "linear-gradient(to top, rgba(20,12,4,0.6), rgba(20,12,4,0))",
};
const listingDistrict: React.CSSProperties = {
  fontSize: 13, color: C.brassBright, fontWeight: 700, fontFamily: FONTS.heading,
  textShadow: "0 1px 3px rgba(0,0,0,0.7)",
};
const profitBox = (positive: boolean): React.CSSProperties => ({
  margin: "8px 0",
  padding: "8px 10px",
  borderRadius: 5,
  background: positive ? "#e2ecd9" : "#f0ddd5",
  border: `1px solid ${positive ? C.positive + "55" : C.negative + "55"}`,
});
const guideBox: React.CSSProperties = {
  fontSize: 11,
  padding: "5px 8px",
  background: "#dfe6f0",
  borderRadius: 5,
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
  border: `1px solid ${C.brassDim}55`,
};
const bidToggle = (active: boolean): React.CSSProperties => ({
  padding: "0 14px",
  borderRadius: 4,
  border: `1px solid ${C.brass}`,
  background: active ? C.wood : "transparent",
  color: active ? C.brassBright : BURGUNDY,
  fontWeight: 700,
  fontSize: 13,
  fontFamily: FONTS.body,
  cursor: "pointer",
  whiteSpace: "nowrap",
});
const bidPanel: React.CSSProperties = {
  marginTop: 10,
  padding: "11px 12px",
  background: "#f0f4f9",
  border: `1px solid ${C.brass}`,
  borderRadius: 5,
};
