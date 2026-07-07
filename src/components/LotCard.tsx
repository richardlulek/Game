import { useState } from "react";
import { allowedTypesFor, PROP_TYPES } from "../engine/data";
import { msek } from "../engine/format";
import type { GameAction, GameState, Lot, PropTypeKey } from "../engine/types";
import { S } from "../styles/styles";

interface LotCardProps {
  lot: Lot;
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/** Kort för en tomt: köp om den är till salu; välj typ (inom detaljplanen),
 *  ansök om planändring eller bygg om den är ägd. */
export function LotCard({ lot, state, dispatch }: LotCardProps) {
  const allowed = allowedTypesFor(lot);
  const [chosen, setChosen] = useState<PropTypeKey>(allowed[0]);

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
        <div style={S.cardRow}>
          <span>Detaljplan</span>
          <strong>{allowed.map((k) => PROP_TYPES[k].label).join(", ")}</strong>
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

  const safeChosen = allowed.includes(chosen) ? chosen : allowed[0];
  const t = PROP_TYPES[safeChosen];
  const cost = lot.area * t.buildCostM2;
  const blocked = (Object.keys(PROP_TYPES) as PropTypeKey[]).filter((k) => !allowed.includes(k));

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
        value={safeChosen}
        onChange={(e) => setChosen(e.target.value as PropTypeKey)}
        style={S.select}
      >
        {allowed.map((k) => (
          <option key={k} value={k}>
            {PROP_TYPES[k].label}
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
        onClick={() => dispatch({ type: "BUILD", id: lot.id, propType: safeChosen })}
      >
        Påbörja bygge
      </button>
      {lot.rezoning ? (
        <div style={{ ...S.cardRow, color: "#a07800", marginTop: 8 }}>
          <span>📋 Planändring pågår</span>
          <strong>
            {PROP_TYPES[lot.rezoning.type].label} · {lot.rezoning.monthsLeft} mån
          </strong>
        </div>
      ) : (
        blocked.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>
              Detaljplanen tillåter inte: ansök om planändring (2.0 MSEK, 6 mån, kräver rep ≥ 40)
            </div>
            <div style={S.upgRow}>
              {blocked.map((k) => (
                <button
                  key={k}
                  style={S.upgBtn}
                  onClick={() => dispatch({ type: "REZONE", id: lot.id, propType: k })}
                >
                  📋 {PROP_TYPES[k].label}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
