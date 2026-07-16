/* Kompakt, skannbart portföljkort för kort-vyns rutnät. Visar bara
   nyckeltal och statusflaggor så hela beståndet går att överblicka –
   klick fäller ut det fullständiga förvaltningskortet (PortfolioCard). */

import { kr, msek } from "../engine/format";
import { propMarketValue, propNOI, propYieldOnCost } from "../engine/property";
import type { GameState, Property } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";
import { BuildingArt } from "./BuildingArt";
import { CondBar } from "./CondBar";

interface Props {
  p: Property;
  state: GameState;
  open: boolean;
  onToggle: () => void;
}

const ESG_COLOR: Record<string, string> = { A: "#1a7a1a", B: "#2d8a2d", C: "#8a7a10", D: "#8a5a10", E: "#8a3010", F: "#7a1010" };

/** En liten färgad statusflagga. */
function Flag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
      background: color + "1e", color, border: `1px solid ${color}55`, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export function PortfolioSummaryCard({ p, state, open, onToggle }: Props) {
  const value = propMarketValue(p, state);

  // Utfällt läge: en slimmad rubrikrad – bilden och nyckeltalen finns
  // redan i förvaltningskortet under, så de dubbleras inte.
  if (open) {
    return (
      <div
        onClick={onToggle}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, padding: "9px 14px", cursor: "pointer",
          background: THEME.parchment, border: `1px solid ${BURGUNDY}`,
          borderRadius: 8, color: C.ink,
          boxShadow: `0 0 0 2px ${BURGUNDY}55, 0 4px 12px rgba(0,0,0,0.3)`,
        }}
        title="Click to close management"
      >
        <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
          <span style={{
            background: BURGUNDY, color: C.brassBright, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 0.8, textTransform: "uppercase", padding: "2px 7px", borderRadius: 3,
          }}>
            {p.typeLabel}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: FONTS.heading, whiteSpace: "nowrap" }}>
            {p.districtName}
          </span>
          <span style={{ fontSize: 13, color: C.inkSoft, whiteSpace: "nowrap" }}>{msek(value)}</span>
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: BURGUNDY, whiteSpace: "nowrap" }}>
          ▲ Dölj förvaltning
        </span>
      </div>
    );
  }

  const building = p.status === "bygger";
  const noi = propNOI(p, state);
  const yieldPct = propYieldOnCost(p, state) * 100;
  const vacant = p.capacity - p.tenants.length;
  const soonest = p.tenants.reduce<number | null>(
    (m, t) => (m === null ? t.monthsLeft : Math.min(m, t.monthsLeft)),
    null,
  );

  // Statusflaggor – bara det som kräver uppmärksamhet.
  const flags: { label: string; color: string }[] = [];
  if (building) flags.push({ label: `🏗️ ${p.buildLeft} mo`, color: "#7a5c2a" });
  if (!building && vacant > 0) flags.push({ label: `${vacant} ledig${vacant > 1 ? "a" : ""}`, color: "#b5542a" });
  if (!building && soonest !== null && soonest <= 3) flags.push({ label: `⏰ ${soonest} mo`, color: "#c0392b" });
  else if (!building && soonest !== null && soonest <= 12) flags.push({ label: `⏰ ${soonest} mo`, color: "#c07f16" });
  if (!building && p.condition < 50) flags.push({ label: `🔧 skick ${p.condition}`, color: "#c0392b" });
  if (p.forSale) flags.push({ label: "🏷️ till salu", color: "#3d54d8" });
  if (p.managed) flags.push({ label: "🤝 managed", color: "#27660a" });
  if (p.regulated) flags.push({ label: "🏛️ reglerad", color: "#2a4a8a" });

  const yieldColor = yieldPct >= 5 ? "#27660a" : yieldPct >= 3 ? "#c07f16" : "#c0392b";

  return (
    <div
      onClick={onToggle}
      style={{
        background: THEME.parchment, border: `1px solid ${open ? BURGUNDY : C.brass}`,
        borderRadius: 8, color: C.ink, cursor: "pointer", overflow: "hidden",
        boxShadow: open ? `0 0 0 2px ${BURGUNDY}55, 0 6px 18px rgba(0,0,0,0.35)` : `${THEME.insetGold}, 0 4px 12px rgba(0,0,0,0.28)`,
      }}
      title="Click to open full management"
    >
      {/* Miniatyr med typ + distrikt */}
      <div style={{ position: "relative", height: 84, borderBottom: `2px solid ${C.brass}` }}>
        <BuildingArt p={p} month={state.month} cover />
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 9px",
          background: "linear-gradient(to top, rgba(20,12,4,0.62), rgba(20,12,4,0))",
        }}>
          <span style={{
            background: BURGUNDY, color: C.brassBright, fontSize: 9.5, fontWeight: 700,
            letterSpacing: 0.8, textTransform: "uppercase", padding: "2px 7px", borderRadius: 3,
          }}>
            {p.typeLabel}
          </span>
          <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {p.energyClass && (
              <span style={{
                fontSize: 9.5, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
                background: ESG_COLOR[p.energyClass] ?? "#555", color: "#fff",
              }}>{p.energyClass}</span>
            )}
            <span style={{ fontSize: 12, color: C.brassBright, fontWeight: 700, fontFamily: FONTS.heading, textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
              {p.districtName}
            </span>
          </span>
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        {/* Värde + yield */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 21, fontWeight: 800, fontFamily: FONTS.heading }}>{msek(value)}</span>
          {!building && (
            p.tenants.length === 0 ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }} title="Yield shows once the first contract is signed">
                — vakant
              </span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: yieldColor }}>
                {yieldPct.toFixed(1)} % yield
              </span>
            )
          )}
        </div>

        {/* Skick + platser */}
        {building ? (
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>🏗️ Ready in {p.buildLeft} mo</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 6px" }}>
              <span style={{ fontSize: 10, color: C.brassDim, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, minWidth: 34 }}>Skick</span>
              <div style={{ flex: 1 }}><CondBar c={p.condition} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.inkSoft }}>
              <span>{p.tenants.length}/{p.capacity} uthyrt</span>
              <span style={{ color: noi >= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>{kr(Math.round(noi / 12))}/mo</span>
            </div>
            {/* Uthyrningsprickar */}
            <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
              {Array.from({ length: p.capacity }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < p.tenants.length ? BURGUNDY : "#e2d3c8" }} />
              ))}
            </div>
          </>
        )}

        {/* Statusflaggor */}
        {flags.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
            {flags.map((f, i) => <Flag key={i} label={f.label} color={f.color} />)}
          </div>
        )}

        <div style={{
          marginTop: 10, textAlign: "center", fontSize: 11.5, fontWeight: 700,
          color: open ? BURGUNDY : C.inkSoft,
        }}>
          {open ? "▲ Hide management" : "▾ Hantera fastigheten"}
        </div>
      </div>
    </div>
  );
}
