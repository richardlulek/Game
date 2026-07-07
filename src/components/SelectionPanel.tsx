import type { CSSProperties } from "react";
import { parcelById } from "../engine/city";
import { DISTRICTS } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { msek } from "../engine/format";
import { holdingBidPrice } from "../engine/market";
import type { GameAction, GameState, RivalHolding } from "../engine/types";
import { S } from "../styles/styles";

/** Infokort för konkurrentägd fastighet – med möjlighet att lägga bud. */
function RivalCard({
  owner,
  holding,
  state,
  dispatch,
}: {
  owner: string;
  holding: RivalHolding;
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const price = holdingBidPrice(holding, state);
  const down = price * (1 - loanTerms(state).maxLtv);
  const cooldown = holding.refusedCooldown ?? 0;
  const canBid = cooldown <= 0 && state.cash >= down;
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.badge}>Konkurrent</span>
        <span style={S.cardDistrict}>{holding.districtName}</span>
      </div>
      <div style={S.cardValue}>{owner}</div>
      <div style={S.cardRow}>
        <span>Typ</span>
        <strong>{holding.typeLabel}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Yta</span>
        <strong>{holding.area} m²</strong>
      </div>
      <div style={S.cardRow}>
        <span>Handpenning vid köp</span>
        <strong>{msek(down)}</strong>
      </div>
      <button
        style={{ ...S.buyBtn, ...(canBid ? {} : S.btnDisabled) }}
        disabled={!canBid}
        onClick={() => dispatch({ type: "BID_HOLDING", rival: owner, holdingId: holding.id })}
      >
        {cooldown > 0
          ? `Ägaren avvaktar (${cooldown} mån)`
          : canBid
            ? `Lägg bud ${msek(price)}`
            : "För dyrt just nu"}
      </button>
    </div>
  );
}
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { ListingCard } from "./ListingCard";
import { LotCard } from "./LotCard";
import { PortfolioCard } from "./PortfolioCard";

const P: Record<string, CSSProperties> = {
  hint: {
    background: "#fff",
    border: "1px dashed #ccc",
    borderRadius: 10,
    padding: 16,
    fontSize: 13,
    color: "#777",
    lineHeight: 1.5,
  },
  head: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#999",
    margin: "0 0 8px",
  },
  ambient: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 16,
    fontSize: 13,
    color: "#666",
  },
};

/** Visar detaljkort för den tomtruta som är vald på kartan. */
export function SelectionPanel() {
  const selectedId = useUiStore((s) => s.selectedParcelId);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);

  if (!selectedId) {
    return (
      <div style={P.hint}>
        <strong>Klicka på kartan</strong> för att välja en byggnad eller tomt.
        <br />
        <span style={{ color: "#b58a2a" }}>⬤</span> Till salu ·{" "}
        <span style={{ color: "#800020" }}>⬤</span> Ägd ·{" "}
        <span style={{ color: "#4d8b52" }}>⬤</span> Tomt
      </div>
    );
  }

  const parcel = parcelById(selectedId);
  const districtName = parcel
    ? (DISTRICTS.find((d) => d.id === parcel.district)?.name ?? parcel.district)
    : "";

  const owned = state.portfolio.find((p) => p.parcelId === selectedId);
  const listing = state.listings.find((p) => p.parcelId === selectedId);
  const lot = state.lots.find((l) => l.parcelId === selectedId);
  let rival: { owner: string; holding: (typeof state.competitors)[0]["holdings"][0] } | null = null;
  for (const c of state.competitors) {
    const h = c.holdings.find((x) => x.parcelId === selectedId);
    if (h) {
      rival = { owner: c.name, holding: h };
      break;
    }
  }

  return (
    <div>
      <h3 style={P.head}>Valt objekt · {districtName}</h3>
      {owned && <PortfolioCard p={owned} state={state} dispatch={dispatch} />}
      {listing && <ListingCard p={listing} state={state} dispatch={dispatch} />}
      {lot && <LotCard lot={lot} state={state} dispatch={dispatch} />}
      {rival && (
        <RivalCard owner={rival.owner} holding={rival.holding} state={state} dispatch={dispatch} />
      )}
      {!owned && !listing && !lot && !rival && (
        <div style={P.ambient}>Den här marken ägs av andra aktörer och är inte till salu.</div>
      )}
    </div>
  );
}
