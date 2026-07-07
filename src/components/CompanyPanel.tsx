/* Bolagspanelen – VD:ns vy över det egna bolaget: nivå, resa mot
   nästa steg, nyckeltal och vad som låses upp längre fram. */

import { useState } from "react";
import { MAX_LEVEL, TIERS, nextTier, tierForLevel, unitCount } from "../engine/company";
import { equityOf } from "../engine/finance";
import { msek } from "../engine/format";
import { salariesTotal } from "../engine/progression";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

const P: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, color: "#1a1a1a" },
  head: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  icon: { fontSize: 44, lineHeight: 1 },
  name: { fontSize: 22, fontWeight: 800 },
  tier: { fontSize: 13, color: "#8a6d1a", fontWeight: 700, letterSpacing: 0.5 },
  card: {
    background: "#faf8f2",
    border: "1px solid #e2ddcf",
    borderRadius: 10,
    padding: "12px 14px",
  },
  statRow: { display: "flex", gap: 18, flexWrap: "wrap" },
  stat: { minWidth: 120 },
  statLabel: { fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase" },
  statValue: { fontSize: 17, fontWeight: 800 },
  barOuter: { height: 8, background: "#e8e4d8", borderRadius: 4, overflow: "hidden", marginTop: 4 },
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

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 1 : value / max));
  return (
    <div style={P.barOuter}>
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: pct >= 1 ? "#4d8b52" : BURGUNDY,
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
                Spara
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={P.name}>{state.companyName ?? "Mitt Fastighetsbolag"}</span>
              <button style={P.editBtn} onClick={() => { setDraft(state.companyName ?? ""); setEditing(true); }}>
                ✎ Byt namn
              </button>
            </div>
          )}
          <div style={P.tier}>
            Nivå {level} av {MAX_LEVEL} · {tier.name} · grundat år 1 · rank #{rank} i staden
          </div>
        </div>
      </div>

      <div style={P.card}>
        <div style={P.statRow}>
          <div style={P.stat}>
            <div style={P.statLabel}>Eget kapital</div>
            <div style={P.statValue}>{msek(equity)}</div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Fastigheter</div>
            <div style={P.statValue}>{units}</div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Anställda chefer</div>
            <div style={P.statValue}>
              {Object.values(state.staff ?? {}).reduce((a, b) => a + b, 0)}
              {salariesTotal(state) > 0 ? ` (${msek(salariesTotal(state))}/mån)` : ""}
            </div>
          </div>
          <div style={P.stat}>
            <div style={P.statLabel}>Dotterbolag</div>
            <div style={P.statValue}>{(state.subsidiaries ?? []).length}</div>
          </div>
          {state.ipoActive && (
            <div style={P.stat}>
              <div style={P.statLabel}>Börsnoterat</div>
              <div style={P.statValue}>✓ FBAB</div>
            </div>
          )}
        </div>
      </div>

      {next ? (
        <div style={P.card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Nästa steg: {next.icon} {next.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={P.barLabel}>
                <span>Eget kapital</span>
                <span>
                  {msek(Math.min(equity, next.minEquity))} / {msek(next.minEquity)}
                </span>
              </div>
              <Bar value={equity} max={next.minEquity} />
            </div>
            <div>
              <div style={P.barLabel}>
                <span>Färdiga fastigheter</span>
                <span>
                  {Math.min(units, next.minUnits)} / {next.minUnits}
                </span>
              </div>
              <Bar value={units} max={next.minUnits} />
            </div>
            {next.requiresIpo && (
              <div style={{ fontSize: 12, color: state.ipoActive ? "#4d8b52" : "#b5542a" }}>
                {state.ipoActive ? "✓ Börsnotering genomförd" : "Kräver dessutom börsnotering (IPO) – se Finans."}
              </div>
            )}
            {next.unlocks.length > 0 && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Låser upp:{" "}
                {next.unlocks
                  .map((id) => WINDOW_LABELS[id] ?? id)
                  .join(" · ")}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ ...P.card, color: "#8a6d1a", fontWeight: 700 }}>
          👑 Högsta nivån nådd – ditt imperium dominerar staden.
        </div>
      )}

      <div style={P.card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Bolagsresan</div>
        <div style={P.ladder}>
          {TIERS.map((t) => (
            <div key={t.level} style={{ ...P.ladderRow, opacity: t.level <= level ? 1 : 0.5 }}>
              <span style={{ width: 20 }}>{t.level <= level ? "✓" : "•"}</span>
              <span style={{ width: 26 }}>{t.icon}</span>
              <strong style={{ minWidth: 210 }}>{t.name}</strong>
              <span style={{ color: "#888", fontSize: 12 }}>
                {t.level === 1
                  ? "start"
                  : `${msek(t.minEquity)} · ${t.minUnits} fastigheter${t.requiresIpo ? " · IPO" : ""}`}
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
  company: "Bolag",
  portfolio: "Portfölj",
  market: "Marknad",
  build: "Bygg",
  stocks: "Börs",
  finance: "Finans",
  research: "Forskning",
  staff: "Anställda",
  group: "Koncern",
  rivals: "Topp",
  log: "Logg",
  overview: "Översikt",
  acquisition: "Förvärv",
  districts: "Distrikt",
  calendar: "Kalender",
  kpi: "KPI",
  tenants: "Hyresgäster",
  milestones: "Milstolpar",
  nyheter: "Nyheter",
  industri: "Industri",
  ind_marknad: "Ind. Marknad",
};
