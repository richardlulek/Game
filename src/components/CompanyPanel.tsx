/* Bolagspanelen – VD:ns vy över det egna bolaget: nivå, resa mot
   nästa steg, nyckeltal och vad som låses upp längre fram. */

import { useState } from "react";
import {
  MAX_LEVEL,
  OVERLOAD_COST_PER_PROP,
  TIERS,
  canUpgrade,
  nextTier,
  orgLoadOf,
  tierForLevel,
  unitCount,
} from "../engine/company";
import { esgRatingOf } from "../engine/esg";
import { equityOf } from "../engine/finance";
import { kr, msek } from "../engine/format";
import { salariesTotal } from "../engine/progression";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY, C } from "../styles/tokens";

const P: Record<string, React.CSSProperties> = {
  // wrap ligger på den MÖRKA fönsterbakgrunden → ljus text; korten nedan
  // sätter egen mörk text (color: C.ink) mot sin ljusa bakgrund.
  wrap: { display: "flex", flexDirection: "column", gap: 14, color: C.creamText },
  head: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  icon: { fontSize: 44, lineHeight: 1 },
  name: { fontSize: 22, fontWeight: 800, color: C.brassBright },
  tier: { fontSize: 13, color: BURGUNDY, fontWeight: 700, letterSpacing: 0.5 },
  card: {
    color: C.ink,
    background: "#f7f9fb",
    border: "1px solid #dde4ec",
    borderRadius: 10,
    padding: "12px 14px",
  },
  statRow: { display: "flex", gap: 18, flexWrap: "wrap" },
  stat: { minWidth: 120 },
  statLabel: { fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontSize: 17, fontWeight: 800 },
  barOuter: { height: 8, background: "#e2e8ef", borderRadius: 4, overflow: "hidden", marginTop: 4 },
  barLabel: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555" },
  ladder: { display: "flex", flexDirection: "column", gap: 6 },
  ladderRow: { display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 },
  editBtn: {
    background: "transparent",
    border: "1px solid #ccc",
    borderRadius: 6,
    padding: "3px 9px",
    fontSize: 11,
    color: "#666",
    cursor: "pointer",
  },
  input: {
    fontSize: 18,
    fontWeight: 800,
    padding: "4px 8px",
    border: `1px solid ${BURGUNDY}`,
    borderRadius: 6,
    width: 260,
  },
};

function Bar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 1 : value / max));
  const full = danger ? "#c76a2a" : "#4d8b52"; // kapacitetstak = varning, mål = grönt
  return (
    <div style={P.barOuter}>
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: pct >= 1 ? full : BURGUNDY,
          transition: "width 0.4s",
        }}
      />
    </div>
  );
}

export function CompanyPanel({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const level = state.companyLevel ?? 1;
  const tier = tierForLevel(level);
  const next = nextTier(level);
  const equity = equityOf(state);
  const units = unitCount(state);
  const load = orgLoadOf(state);
  const up = canUpgrade(state);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.companyName ?? "");
  const rank =
    [...state.competitors.map((c) => c.equity), equity].sort((a, b) => b - a).indexOf(equity) + 1;

  return (
    <div style={P.wrap}>
      <div style={P.head}>
        <span style={P.icon}>{tier.icon}</span>
        <div>
          {editing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={P.input}
                value={draft}
                maxLength={32}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <button
                style={{ ...P.editBtn, background: BURGUNDY, color: "#fff", border: "none" }}
                onClick={() => {
                  dispatch({ type: "SET_COMPANY_NAME", name: draft });
                  setEditing(false);
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={P.name}>{state.companyName ?? "My Property Company"}</span>
              <button style={P.editBtn} onClick={() => { setDraft(state.companyName ?? ""); setEditing(true); }}>
                ✎ Rename
              </button>
            </div>
          )}
          <div style={P.tier}>
            Level {level} of {MAX_LEVEL} · {tier.name} · founded year 1 · rank #{rank} in the city
          </div>
        </div>
      </div>

      <div style={P.card}>
        <div style={P.statRow}>
          <div style={P.stat}>
            <div style={P.statLabel}>Equity</div>
            <div style={P.statValue}>{msek(equity)}</div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Properties</div>
            <div style={P.statValue}>{units}</div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Managers employed</div>
            <div style={P.statValue}>
              {Object.values(state.staff ?? {}).reduce((a, b) => a + b, 0)}
              {salariesTotal(state) > 0 ? ` (${msek(salariesTotal(state))}/mo)` : ""}
            </div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Subsidiaries</div>
            <div style={P.statValue}>{(state.subsidiaries ?? []).length}</div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>ESG rating</div>
            <div style={{ ...P.statValue, color: esgRatingOf(state).spreadDelta < 0 ? "#4d8b52" : esgRatingOf(state).spreadDelta > 0 ? "#b5542a" : undefined }}>
              {esgRatingOf(state).letter}
            </div>
          </div>
          {state.ipoActive && (
            <div style={P.stat}>
              <div style={P.statLabel}>Listed</div>
              <div style={P.statValue}>✓ FBAB</div>
            </div>
          )}
        </div>
      </div>

      {/* Organisationen: kontorskostnad och förvaltningskapacitet */}
      <div style={{ ...P.card, ...(load.over > 0 ? { border: "1px solid #d9a13b", background: "#eef2f8" } : {}) }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Organization</div>
        <div style={P.statRow}>
          <div style={P.stat}>
            <div style={P.statLabel}>Office cost</div>
            <div style={P.statValue}>{tier.monthlyOverhead > 0 ? `${kr(tier.monthlyOverhead)}/mo` : "$0 (the kitchen table)"}</div>
          </div>
          <div style={{ ...P.stat, minWidth: 220 }}>
            <div style={P.statLabel}>Self-managed properties</div>
            <div style={{ ...P.statValue, color: load.over > 0 ? "#b5542a" : undefined }}>
              {load.selfManaged} / {load.cap}
            </div>
            <Bar value={load.selfManaged} max={load.cap} danger />
          </div>
        </div>
        {load.over > 0 ? (
          <div style={{ fontSize: 12.5, color: "#9a5a1a", marginTop: 8 }}>
            ⚠️ {load.over} properties over capacity: {kr(load.over * OVERLOAD_COST_PER_PROP)}/mo in
            extra cost. Expand the company, hire a manager per property
            or a portfolio director (Policy → Management).
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Properties with a manager or portfolio director don't burden the organization.
          </div>
        )}
      </div>

      {next ? (
        <div style={P.card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Next step: {next.icon} {next.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={P.barLabel}>
                <span>Equity</span>
                <span>
                  {msek(Math.min(equity, next.minEquity))} / {msek(next.minEquity)}
                </span>
              </div>
              <Bar value={equity} max={next.minEquity} />
            </div>
            <div>
              <div style={P.barLabel}>
                <span>Completed properties</span>
                <span>
                  {Math.min(units, next.minUnits)} / {next.minUnits}
                </span>
              </div>
              <Bar value={units} max={next.minUnits} />
            </div>
            {next.requiresIpo && (
              <div style={{ fontSize: 12, color: state.ipoActive ? "#4d8b52" : "#b5542a" }}>
                {state.ipoActive ? "✓ Stock listing completed" : "Also requires a stock listing (IPO) – see Finance."}
              </div>
            )}
            {next.unlocks.length > 0 && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Unlocks:{" "}
                {next.unlocks
                  .map((id) => WINDOW_LABELS[id] ?? id)
                  .join(" · ")}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#666" }}>
              New office cost: {kr(next.monthlyOverhead)}/mo · capacity {next.selfManagedCap}{" "}
              self-managed properties
            </div>
            {/* Expansionen är ett aktivt beslut som kostar pengar. */}
            <button
              disabled={!up.qualified || !up.affordable}
              onClick={() => dispatch({ type: "UPGRADE_COMPANY" })}
              style={{
                background: up.qualified && up.affordable ? BURGUNDY : "#c9c4b8",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "11px 16px",
                fontSize: 14,
                fontWeight: 800,
                cursor: up.qualified && up.affordable ? "pointer" : "default",
                marginTop: 4,
              }}
            >
              {up.qualified
                ? up.affordable
                  ? `📈 Expand the company (${next.upgradeCost > 0 ? msek(next.upgradeCost) : "no cost"})`
                  : `Insufficient cash – the expansion costs ${msek(next.upgradeCost)}`
                : `Meet the requirements above to expand${next.upgradeCost > 0 ? ` (${msek(next.upgradeCost)})` : ""}`}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...P.card, color: "#4757c8", fontWeight: 700 }}>
          👑 Top level reached – your empire dominates the city.
        </div>
      )}

      <div style={P.card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>The company journey</div>
        <div style={P.ladder}>
          {TIERS.map((t) => (
            <div key={t.level} style={{ ...P.ladderRow, opacity: t.level <= level ? 1 : 0.5 }}>
              <span style={{ width: 20 }}>{t.level <= level ? "✓" : "•"}</span>
              <span style={{ width: 26 }}>{t.icon}</span>
              <strong style={{ minWidth: 210 }}>{t.name}</strong>
              <span style={{ color: "#888", fontSize: 12 }}>
                {t.level === 1
                  ? "start"
                  : `${msek(t.minEquity)} · ${t.minUnits} properties${t.requiresIpo ? " · IPO" : ""}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Läsbara namn för fönster-id:n (håll i synk med TABS i FastighetsImperium). */
const WINDOW_LABELS: Record<string, string> = {
  company: "Company",
  policy: "Policy",
  portfolio: "Portfolio",
  market: "Market",
  build: "Build",
  stocks: "Stocks",
  finance: "Finance",
  research: "Research",
  staff: "Staff",
  group: "Group (tab in Company)",
  rivals: "Rivals",
  log: "Log",
  overview: "Overview (tab in Company)",
  acquisition: "Acquisition",
  districts: "Districts",
  calendar: "Calendar",
  kpi: "KPI (tab in Company)",
  tenants: "Tenants",
  milestones: "Milestones (tab in Company)",
  nyheter: "News",
  industri: "Industry",
  ind_marknad: "Ind. Market",
};
