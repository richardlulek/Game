import { kr, msek } from "../engine/format";
import { propMarketValue, propNOI, propPotentialRent } from "../engine/property";
import { PROP_TYPES, UPGRADES } from "../engine/data";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { CondBar } from "./CondBar";

interface PortfolioCardProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Om satt visas en 📍-knapp som fokuserar fastigheten på kartan. */
  onLocate?: () => void;
}

function DistrictLabel({ name, onLocate }: { name: string; onLocate?: () => void }) {
  return (
    <span style={S.cardDistrict}>
      {name}
      {onLocate && (
        <button style={S.locateBtn} title="Visa på kartan" onClick={onLocate}>
          📍
        </button>
      )}
    </span>
  );
}

export function PortfolioCard({ p, state, dispatch, onLocate }: PortfolioCardProps) {
  const value = propMarketValue(p, state);
  const noi = propNOI(p, state);

  if (p.status === "bygger") {
    return (
      <div style={{ ...S.card, border: `1px solid ${BURGUNDY}55` }}>
        <div style={S.cardHead}>
          <span style={S.badge}>{p.typeLabel}</span>
          <DistrictLabel name={p.districtName} onLocate={onLocate} />
        </div>
        <div style={{ ...S.cardValue, color: BURGUNDY }}>🏗️ Bygger</div>
        <div style={S.cardRow}>
          <span>Yta</span>
          <strong>{p.area} m²</strong>
        </div>
        <div style={S.cardRow}>
          <span>Klart om</span>
          <strong>{p.buildLeft} mån</strong>
        </div>
        <div style={{ ...S.condBar, marginTop: 8, width: "100%" }}>
          <span
            style={{
              ...S.condFill,
              width: `${100 - (p.buildLeft / PROP_TYPES[p.type].buildMonths) * 100}%`,
              background: BURGUNDY,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.badge}>{p.typeLabel}</span>
        <DistrictLabel name={p.districtName} onLocate={onLocate} />
      </div>
      <div style={S.cardValue}>{msek(value)}</div>
      <div style={S.cardRow}>
        <span>Yta</span>
        <strong>{p.area} m²</strong>
      </div>
      <div style={S.cardRow}>
        <span>Skick</span>
        <CondBar c={p.condition} />
      </div>
      {p.tenant ? (
        <div style={S.tenantBox}>
          <div style={{ fontWeight: 700, color: BURGUNDY }}>{p.tenant.name}</div>
          <div style={S.cardRow}>
            <span>Hyra/mån</span>
            <strong>{kr(p.tenant.rent)}</strong>
          </div>
          <div style={S.cardRow}>
            <span>Kontrakt kvar</span>
            <strong>{p.tenant.monthsLeft} mån</strong>
          </div>
        </div>
      ) : (
        <div style={S.vacantBox}>
          <span>Vakant — potential {kr(propPotentialRent(p, state) / 12)}/mån</span>
          <button style={S.leaseBtn} onClick={() => dispatch({ type: "LEASE", id: p.id })}>
            Hyr ut
          </button>
        </div>
      )}
      <div style={S.cardRow}>
        <span>Driftnetto/år</span>
        <strong style={{ color: noi >= 0 ? "#27660a" : "#c0392b" }}>{kr(noi)}</strong>
      </div>
      <div style={S.upgRow}>
        {UPGRADES.map((u) => {
          const done = p.upgrades.includes(u.id);
          return (
            <button
              key={u.id}
              disabled={done}
              title={`${u.desc} (${msek(value * u.cost)})`}
              onClick={() => dispatch({ type: "UPGRADE", id: p.id, upg: u.id })}
              style={{ ...S.upgBtn, ...(done ? S.upgDone : {}) }}
            >
              {done ? "✓ " : ""}
              {u.name}
            </button>
          );
        })}
      </div>
      <button style={S.sellBtn} onClick={() => dispatch({ type: "SELL", id: p.id })}>
        Sälj för {msek(value)}
      </button>
    </div>
  );
}
