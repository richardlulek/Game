import { useState } from "react";
import { PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { GameAction, GameState, Lot, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";

interface LotCardProps {
  lot: Lot;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/** Kort för en tomt: köp om den är till salu, välj byggnadstyp och bygg om den är ägd. */
export function LotCard({ lot, state, dispatch }: LotCardProps) {
  const [chosen, setChosen] = useState<PropTypeKey>("bostad");

  if (!lot.owned) {
    const ok = state.cash >= lot.price;
    return (
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.badge}>Tomt till salu</span>
          <span style={S.cardDistrict}>{lot.districtName}</span>
        </div>
        <div style={S.cardValue}>{msek(lot.price)}</div>
        <div style={S.cardRow}>
          <span>Yta</span>
          <strong>{lot.area} m²</strong>
        </div>
        <button
          style={{ ...S.buyBtn, ...(ok ? {} : S.btnDisabled) }}
          disabled={!ok}
          onClick={() => dispatch({ type: "BUY_LOT", id: lot.id })}
        >
          {ok ? "Köp tomt" : "För dyrt"}
        </button>
      </div>
    );
  }

  const t = PROP_TYPES[chosen];
  const cost = lot.area * t.buildCostM2;
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.badge}>Min tomt</span>
        <span style={S.cardDistrict}>{lot.districtName}</span>
      </div>
      <div style={S.cardRow}>
        <span>Yta</span>
        <strong>{lot.area} m²</strong>
      </div>
      <select
        value={chosen}
        onChange={(e) => setChosen(e.target.value as PropTypeKey)}
        style={S.select}
      >
        {Object.entries(PROP_TYPES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      <div style={S.cardRow}>
        <span>Byggkostnad</span>
        <strong>{msek(cost)}</strong>
      </div>
      <div style={S.cardRow}>
        <span>Byggtid</span>
        <strong>{t.buildMonths} mån</strong>
      </div>
      <button
        style={S.buyBtn}
        onClick={() => dispatch({ type: "BUILD", id: lot.id, propType: chosen })}
      >
        Påbörja bygge
      </button>
    </div>
  );
}
