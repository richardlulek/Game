import { locationFactor } from "../engine/city";
import { loanTerms } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { buyNowPrice, nextBidAmount } from "../engine/market";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { CondBar } from "./CondBar";

interface ListingCardProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/** Auktionskort för ett marknadsobjekt: bjud eller köp direkt till premie. */
export function ListingCard({ p, state, dispatch }: ListingCardProps) {
  const noi = propPotentialRent(p, state) - propAnnualOpex(p, state);
  const lf = locationFactor(p.parcelId);
  const y = noi / p.askPrice;
  const { maxLtv } = loanTerms(state);
  const bid = nextBidAmount(p);
  const buyNow = buyNowPrice(p);
  const youLead = !!p.bestBid?.isPlayer;
  const canBid = !youLead && state.cash >= bid * (1 - maxLtv);
  const canBuy = state.cash >= buyNow * (1 - maxLtv);

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.badge}>{p.typeLabel}</span>
        <span style={S.cardDistrict}>{p.districtName}</span>
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
        <span>Läge</span>
        <strong style={{ color: lf >= 1 ? "#27660a" : "#c0392b" }}>
          {lf >= 1 ? "+" : "−"}
          {Math.abs(Math.round((lf - 1) * 100))} %
        </strong>
      </div>
      <div style={S.cardRow}>
        <span>{p.tenant ? "Uthyrt till" : "Status"}</span>
        <strong>{p.tenant ? p.tenant.name : "Vakant"}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Driftnetto/år</span>
        <strong style={{ color: "#27660a" }}>{kr(noi)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Direktavkastning</span>
        <strong>{pct(y)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Högsta bud</span>
        <strong style={{ color: youLead ? "#27660a" : "#333" }}>
          {p.bestBid ? `${msek(p.bestBid.amount)} (${p.bestBid.bidder})` : "Inga bud"}
        </strong>
      </div>
      <div style={S.cardRow}>
        <span>Auktionen avslutas</span>
        <strong>{p.auctionMonthsLeft} mån</strong>
      </div>
      <button
        style={{ ...S.buyBtn, ...(youLead || canBid ? {} : S.btnDisabled) }}
        disabled={youLead || !canBid}
        onClick={() => dispatch({ type: "BID", id: p.id })}
      >
        {youLead ? "✓ Du har högsta budet" : canBid ? `Bjud ${msek(bid)}` : "För dyrt att bjuda"}
      </button>
      <button
        style={{ ...S.sellBtn, ...(canBuy ? {} : S.btnDisabled) }}
        disabled={!canBuy}
        onClick={() => dispatch({ type: "BUY", id: p.id })}
      >
        Köp direkt {msek(buyNow)}
      </button>
    </div>
  );
}
