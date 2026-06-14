import { useEffect, useRef, useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "../audio/sound";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propNOI } from "../engine/property";
import { useGameStore } from "../store/gameStore";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { Animations } from "./Animations";
import { BuildPanel } from "./BuildPanel";
import { DecisionModal } from "./DecisionModal";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { ListingCard } from "./ListingCard";
import { LogPanel } from "./LogPanel";
import { MapPanel } from "./MapPanel";
import { OffersModal } from "./OffersModal";
import { PortfolioCard } from "./PortfolioCard";
import { RivalsPanel } from "./RivalsPanel";
import { StatusBar } from "./StatusBar";
import { Toasts } from "./Toasts";
import { Toolbar } from "./Toolbar";

const TABS = [
  { id: "portfolio", label: "Portfölj" },
  { id: "market",    label: "Marknad" },
  { id: "map",       label: "Karta" },
  { id: "build",     label: "Bygg" },
  { id: "finance",   label: "Finans" },
  { id: "rivals",    label: "Topp" },
  { id: "log",       label: "Logg" },
];

export default function FastighetsImperium() {
  const state    = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const save     = useGameStore((s) => s.save);
  const load     = useGameStore((s) => s.load);

  const [tab, setTab]         = useState("portfolio");
  const [saved, setSaved]     = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  // Månadspuls – ett kort svep när månaden växlar.
  const [pulseKey, setPulseKey] = useState(0);
  const absMonth = state.year * 12 + state.month;
  const prevMonth = useRef(absMonth);
  useEffect(() => {
    if (absMonth !== prevMonth.current) {
      prevMonth.current = absMonth;
      setPulseKey((k) => k + 1);
    }
  }, [absMonth]);

  const doSave = () => { save(); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const toggleSound = () => { const v = !soundOn; setSoundEnabled(v); setSoundOn(v); };
  const offersCount = (state.offers ?? []).length;

  const equity          = equityOf(state);
  const monthlyNOI      = state.portfolio.reduce((a, p) => a + propNOI(p, state) / 12, 0);
  const terms           = loanTerms(state);
  const monthlyInterest = (state.debt * (terms.rate / 100)) / 12;
  const ltv             = ltvOf(state);
  const myRank          = [...state.competitors.map((c) => c.equity), equity]
    .sort((a, b) => b - a).indexOf(equity) + 1;

  return (
    <div style={S.appLayout}>
      <Animations />

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <Toolbar
        state={state} dispatch={dispatch} saved={saved} onSave={doSave} onLoad={load}
        offersCount={offersCount} onOpenOffers={() => setShowOffers(true)}
        soundOn={soundOn} onToggleSound={toggleSound}
      />

      {/* ── Game-over banner ────────────────────────────────── */}
      {state.gameOver && (
        <div style={{
          background: "#5a0010", color: "#fff", textAlign: "center",
          padding: "10px 16px", fontSize: 14, fontWeight: 700,
          display: "flex", justifyContent: "center", alignItems: "center", gap: 16,
        }}>
          Spelet är slut — {state.year} år spelade
          <button
            style={{ ...S.toolbarNextBtn, padding: "5px 14px", fontSize: 13 }}
            onClick={() => dispatch({ type: "RESET" })}
          >
            Spela igen
          </button>
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div style={tabBarStyle}>
        {TABS.map((t) => (
          <button
            key={t.id}
            style={{ ...tabStyle, ...(tab === t.id ? tabActiveStyle : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.id === "portfolio"
              ? `Portfölj (${state.portfolio.length})`
              : t.label}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div style={contentStyle}>
        {tab === "portfolio" && (
          <div style={S.grid}>
            {state.portfolio.length === 0 && (
              <div style={S.empty}>
                Inga fastigheter ännu. Gå till <strong>Marknad</strong> eller{" "}
                <strong>Bygg</strong>.
              </div>
            )}
            {state.portfolio.map((p) => (
              <PortfolioCard key={p.id} p={p} state={state} dispatch={dispatch} />
            ))}
          </div>
        )}

        {tab === "market" && (
          <div>
            <div style={S.marketBar}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                Objekt till salu ({state.listings.length})
              </span>
              <button
                style={S.smallBtn}
                onClick={() => dispatch({ type: "REFRESH_LISTINGS" })}
              >
                ↻ Nya objekt
              </button>
            </div>
            <div style={S.grid}>
              {state.listings.map((p) => (
                <ListingCard key={p.id} p={p} state={state} dispatch={dispatch} />
              ))}
            </div>
          </div>
        )}

        {tab === "map" && <MapPanel state={state} dispatch={dispatch} />}

        {tab === "build" && <BuildPanel state={state} dispatch={dispatch} />}

        {tab === "finance" && (
          <>
            <FinancePanel
              state={state} dispatch={dispatch}
              equity={equity} ltv={ltv} terms={terms}
            />
            <div style={{ marginTop: 18 }}>
              <EquityChart history={state.history} />
            </div>
          </>
        )}

        {tab === "rivals" && <RivalsPanel state={state} equity={equity} />}

        {tab === "log" && <LogPanel log={state.log} />}
      </div>

      {/* ── Status bar ──────────────────────────────────────── */}
      <StatusBar
        state={state} equity={equity} ltv={ltv}
        terms={terms} monthlyNOI={monthlyNOI}
        monthlyInterest={monthlyInterest} myRank={myRank}
      />

      {/* ── Månadspuls ──────────────────────────────────────── */}
      {pulseKey > 0 && (
        <div
          key={pulseKey}
          style={{
            position: "fixed", inset: 0, pointerEvents: "none", zIndex: 900,
            background: `radial-gradient(circle at 50% 0%, ${BURGUNDY}22, transparent 60%)`,
            animation: "fi-month-pulse 0.7s ease-out",
          }}
        />
      )}

      {/* ── Reaktiva lager ──────────────────────────────────── */}
      <Toasts log={state.log} />
      {showOffers && (
        <OffersModal state={state} dispatch={dispatch} onClose={() => setShowOffers(false)} />
      )}
      <DecisionModal state={state} dispatch={dispatch} />
    </div>
  );
}

// ── Lokala stilar ────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  overflowX: "auto",
  background: "#fff",
  borderBottom: "2px solid #eee",
  flexShrink: 0,
  WebkitOverflowScrolling: "touch",
};

const tabStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: "#888",
  borderBottom: "2px solid transparent",
  marginBottom: -2,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const tabActiveStyle: React.CSSProperties = {
  color: BURGUNDY,
  borderBottom: `2px solid ${BURGUNDY}`,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  background: "#faf8f6",
  WebkitOverflowScrolling: "touch",
};
