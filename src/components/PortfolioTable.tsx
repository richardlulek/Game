import React from "react";
import { useState } from "react";
import { kr, msek } from "../engine/format";
import { propMarketValue, propNOI, propPotentialRent } from "../engine/property";
import { UPGRADES } from "../engine/data";
import type { GameAction, GameState, Property } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { CondBar } from "./CondBar";

const TYPE_ICONS: Record<string, string> = {
  bostad: "🏠",
  kontor: "🏢",
  butik: "🏪",
  industri: "🏭",
};

function getClusterCount(p: Property, state: GameState): number {
  return state.portfolio.filter((x) => x.district === p.district && x.status === "klar").length;
}

interface RowProps {
  p: Property;
  state: GameState;
  dispatch: (action: GameAction) => void;
  isExpanded: boolean;
  onToggle: () => void;
  isAlt: boolean;
}

function PropertyRow({ p, state, dispatch, isExpanded, onToggle, isAlt }: RowProps) {
  const value = propMarketValue(p, state);
  const noi = propNOI(p, state);
  const cluster = getClusterCount(p, state);
  const hasWarn = p.tenants.some((t) => t.monthsLeft <= 3);
  const hasCond = p.condition < 40;

  const rowStyle = {
    ...S.tableRow,
    ...(isAlt ? S.tableRowAlt : {}),
    ...(isExpanded ? S.tableRowActive : {}),
  };

  let statusEl: React.ReactNode;
  if (p.status === "bygger") {
    statusEl = <span style={{ color: "#cc8020" }}>⏳ {p.buildLeft}m</span>;
  } else if (p.tenants.length > 0) {
    statusEl = <span style={{ color: "#27660a", fontSize: 11 }}>✓ {p.tenants.length}/{p.capacity} uthyrd</span>;
  } else {
    statusEl = <span style={{ color: "#999" }}>— Vakant</span>;
  }

  return (
    <>
      <div style={rowStyle} onClick={onToggle}>
        {/* Icon + name + district */}
        <div style={{ flex: 2, minWidth: 0 }}>
          <span style={{ marginRight: 4 }}>{TYPE_ICONS[p.type] || "🏠"}</span>
          <span style={{ fontWeight: 600, color: "#222" }}>{p.typeLabel}</span>
          {hasWarn && <span style={{ marginLeft: 4, color: "#e09000" }} title="Kontrakt löper snart ut">⚠</span>}
          {hasCond && <span style={{ marginLeft: 4, color: "#c0392b" }} title="Dåligt skick">📉</span>}
          {cluster >= 3 && (
            <span style={{ marginLeft: 4, background: "#7a4800", color: "#ffd080", fontSize: 10, padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>
              ★ Kluster
            </span>
          )}
          <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>{p.districtName}</div>
        </div>
        {/* Value */}
        <div style={{ flex: 1, textAlign: "right", fontSize: 11, fontWeight: 600 }}>{msek(value)}</div>
        {/* NOI/mån */}
        <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: noi >= 0 ? "#27660a" : "#c0392b", fontWeight: 600 }}>
          {kr(noi / 12)}
        </div>
        {/* Skick bar */}
        <div style={{ width: 60, flexShrink: 0 }}>
          {p.status !== "bygger" ? <CondBar c={p.condition} /> : <span style={{ fontSize: 10, color: "#999" }}>—</span>}
        </div>
        {/* Status */}
        <div style={{ flex: 1, fontSize: 11 }}>{statusEl}</div>
      </div>
      {isExpanded && (
        <div style={S.tableExpanded}>
          <PropertyActions p={p} state={state} dispatch={dispatch} />
        </div>
      )}
    </>
  );
}

function PropertyActions({ p, state, dispatch }: { p: Property; state: GameState; dispatch: (a: GameAction) => void }) {
  const value = propMarketValue(p, state);

  if (p.status === "bygger") {
    return <div style={{ color: "#666", fontSize: 12 }}>🏗️ Under byggnation — klart om {p.buildLeft} mån</div>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {/* Underhåll */}
      <button
        style={{ ...S.miniActionBtn, background: "#555" }}
        onClick={() => dispatch({ type: "MAINTAIN", id: p.id })}
        title={`Underhåll (+15 skick, kostar ${msek(value * 0.02)})`}
      >
        🔧 Underhåll
      </button>

      {/* Hyresgäst actions */}
      {p.tenants.length < p.capacity && (
        <button
          style={{ ...S.miniActionBtn, background: BURGUNDY }}
          onClick={() => dispatch({ type: "LEASE", id: p.id })}
        >
          Hyr ut
        </button>
      )}
      {p.tenants.map((t) => (
        <React.Fragment key={t.id}>
          <button
            style={{ ...S.miniActionBtn, background: "#c0392b" }}
            onClick={() => dispatch({ type: "EVICT", id: p.id, tenantId: t.id })}
          >
            Säg upp {t.name.split(" ")[0]}
          </button>
          <button
            style={{ ...S.miniActionBtn, background: "#27660a" }}
            onClick={() => dispatch({ type: "RENEW_LEASE", id: p.id, tenantId: t.id })}
          >
            Förnya {t.name.split(" ")[0]}
          </button>
        </React.Fragment>
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#ddd", margin: "0 4px" }} />

      {/* Upgrades */}
      {UPGRADES.map((u) => {
        const done = p.upgrades.includes(u.id);
        return (
          <button
            key={u.id}
            disabled={done}
            title={`${u.desc} (${msek(value * u.cost)})`}
            onClick={() => dispatch({ type: "UPGRADE", id: p.id, upg: u.id })}
            style={{
              ...S.miniActionBtn,
              background: done ? "#bbb" : "#6a3a4a",
              cursor: done ? "default" : "pointer",
            }}
          >
            {done ? "✓ " : ""}{u.name}
          </button>
        );
      })}

      {/* Sell */}
      <div style={{ marginLeft: "auto" }}>
        <button
          style={{ ...S.miniActionBtn, background: "#7a5a00", border: "1px solid #b8a060" }}
          onClick={() => dispatch({ type: "SELL", id: p.id })}
        >
          Sälj {msek(value)}
        </button>
      </div>
    </div>
  );
}

interface PortfolioTableProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function PortfolioTable({ state, dispatch }: PortfolioTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (id: number) => setExpanded(expanded === id ? null : id);

  return (
    <div>
      {/* Header */}
      <div style={S.tableHead}>
        <div style={{ flex: 2 }}>Fastighet</div>
        <div style={{ flex: 1, textAlign: "right" }}>Värde</div>
        <div style={{ flex: 1, textAlign: "right" }}>NOI/mån</div>
        <div style={{ width: 60, flexShrink: 0 }}>Skick</div>
        <div style={{ flex: 1 }}>Status</div>
      </div>
      {state.portfolio.length === 0 ? (
        <div style={S.tableEmpty}>
          Inga fastigheter ännu. Gå till <strong>Marknad</strong> eller <strong>Bygg</strong>.
        </div>
      ) : (
        state.portfolio.map((p, i) => (
          <PropertyRow
            key={p.id}
            p={p}
            state={state}
            dispatch={dispatch}
            isExpanded={expanded === p.id}
            onToggle={() => toggle(p.id)}
            isAlt={i % 2 === 1}
          />
        ))
      )}
    </div>
  );
}
