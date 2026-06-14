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
}

export function PortfolioCard({ p, state, dispatch }: PortfolioCardProps) {
  const value = propMarketValue(p, state);
  const noi = propNOI(p, state);
  const maintainCost = Math.round(value * 0.02);
  const canMaintain = state.cash >= maintainCost && !state.gameOver;

  if (p.status === "bygger") {
    return (
      <div style={{ ...S.card, borderColor: BURGUNDY + "55" }}>
        <div style={S.cardHead}>
          <span style={S.badge}>{p.typeLabel}</span>
          <span style={S.cardDistrict}>{p.districtName}</span>
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

  const contractExpiring = p.tenant && p.tenant.monthsLeft <= 12;

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.badge}>{p.typeLabel}</span>
        <span style={S.cardDistrict}>{p.districtName}</span>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontWeight: 700, color: BURGUNDY }}>{p.tenant.name}</div>
            <button
              title="Säg upp hyresgästen (−3 reputation)"
              onClick={() => dispatch({ type: "EVICT", id: p.id })}
              disabled={state.gameOver}
              style={{
                background: "none",
                border: "none",
                color: "#c0392b",
                fontSize: 13,
                cursor: "pointer",
                padding: "0 2px",
                fontWeight: 600,
                opacity: state.gameOver ? 0.4 : 1,
              }}
            >
              Säg upp
            </button>
          </div>
          <div style={S.cardRow}>
            <span>Hyra/mån</span>
            <strong>{kr(p.tenant.rent)}</strong>
          </div>
          <div style={{ ...S.cardRow, marginTop: 2 }}>
            <span style={{ color: contractExpiring ? "#c05000" : undefined }}>
              {contractExpiring ? `⚠ ${p.tenant.monthsLeft} mån kvar` : `Kontrakt ${p.tenant.monthsLeft} mån`}
            </span>
            {contractExpiring && (
              <button
                onClick={() => dispatch({ type: "RENEW_LEASE", id: p.id })}
                disabled={state.gameOver}
                style={{
                  background: "#27660a",
                  color: "#fff",
                  border: "none",
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: state.gameOver ? "default" : "pointer",
                  opacity: state.gameOver ? 0.5 : 1,
                }}
              >
                Förläng
              </button>
            )}
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

      {/* Underhåll – repeaterbar skickförbättring */}
      <button
        onClick={() => dispatch({ type: "MAINTAIN", id: p.id })}
        disabled={!canMaintain}
        title={`Kostar ${msek(maintainCost)} och ger +15 skick`}
        style={{
          width: "100%",
          marginTop: 10,
          background: canMaintain ? "#f0f6ee" : "#f5f5f5",
          border: `1px solid ${canMaintain ? "#6aaa5a" : "#ddd"}`,
          color: canMaintain ? "#2a6a1a" : "#aaa",
          padding: "7px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 12,
          cursor: canMaintain ? "pointer" : "default",
        }}
      >
        🔧 Underhåll +15 skick ({msek(maintainCost)})
      </button>

      {/* Engångs-uppgraderingar */}
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
