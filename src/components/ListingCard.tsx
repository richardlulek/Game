import { kr, msek, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { propAnnualOpex, propPotentialRent } from "../engine/property";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { CondBar } from "./CondBar";

interface ListingCardProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function ListingCard({ p, state, dispatch }: ListingCardProps) {
  const noi = propPotentialRent(p, state) - propAnnualOpex(p, state);
  const y = noi / p.askPrice;
  const down = p.askPrice * (1 - loanTerms(state).maxLtv);
  const ok = state.cash >= down;
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
        <span>Handpenning</span>
        <strong>{msek(down)}</strong>
      </div>
      <button
        style={{ ...S.buyBtn, ...(ok ? {} : S.btnDisabled) }}
        disabled={!ok}
        onClick={() => dispatch({ type: "BUY", id: p.id })}
      >
        {ok ? "Köp" : "För dyrt"}
      </button>
    </div>
  );
}
