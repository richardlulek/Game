import { useEffect, useRef, useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "../audio/sound";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { msek } from "../engine/format";
import { propNOI } from "../engine/property";
import { SCENARIOS, rivalScenarioProgress } from "../engine/scenarios";
import type { ScenarioId } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { listSaveSlots } from "../store/persistence";
import { S } from "../styles/styles";
import { BURGUNDY, C, FONTS } from "../styles/tokens";
import { Animations } from "./Animations";
import { BuildPanel } from "./BuildPanel";
import { DecisionModal } from "./DecisionModal";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { CityMap } from "./CityMap";
import { MarketPanel } from "./MarketPanel";
import { LogPanel } from "./LogPanel";
import { OffersModal } from "./OffersModal";
import { PortfolioCard } from "./PortfolioCard";
import { RivalsPanel } from "./RivalsPanel";
import { StatusBar } from "./StatusBar";
import { TitleScreen } from "./TitleScreen";
import { Toasts } from "./Toasts";
import { Toolbar } from "./Toolbar";
import { StockExchange } from "./StockExchange";
import { GroupOverview } from "./GroupOverview";
import { ResearchPanel } from "./ResearchPanel";
import { StaffPanel } from "./StaffPanel";
import { PortfolioTable } from "./PortfolioTable";
import { AcquisitionPanel } from "./AcquisitionPanel";
import { DistrictPanel } from "./DistrictPanel";
import { ContractCalendar } from "./ContractCalendar";
import { KPIPanel } from "./KPIPanel";
import { TenantPanel } from "./TenantPanel";
import { MilestonesPanel } from "./MilestonesPanel";
import { NewsFeedPanel } from "./NewsFeedPanel";
import { OnboardingOverlay } from "./OnboardingOverlay";

const TABS = [
  { id: "portfolio", label: "Portfölj" },
  { id: "market",    label: "Marknad" },
  { id: "map",       label: "Karta" },
  { id: "build",     label: "Bygg" },
  { id: "stocks",    label: "Börs" },
  { id: "finance",   label: "Finans" },
  { id: "research",  label: "Forskning" },
  { id: "staff",     label: "Anställda" },
  { id: "group",     label: "Koncern" },
  { id: "rivals",    label: "Topp" },
  { id: "log",       label: "Logg" },
  { id: "overview",     label: "Översikt" },
  { id: "acquisition",  label: "Förvärv" },
  { id: "districts",    label: "Distrikt" },
  { id: "calendar",     label: "Kalender" },
  { id: "kpi",          label: "KPI" },
  { id: "tenants",      label: "Hyresgäster" },
  { id: "milestones",   label: "Milstolpar" },
  { id: "nyheter",      label: "Nyheter" },
];

export default function FastighetsImperium() {
  const state      = useGameStore((s) => s.state);
  const dispatch   = useGameStore((s) => s.dispatch);
  const save       = useGameStore((s) => s.save);
  const load       = useGameStore((s) => s.load);
  const setSlotFn  = useGameStore((s) => s.setSlot);

  const [started, setStarted] = useState(false);
  const [tab, setTab]         = useState("portfolio");
  const [saved, setSaved]     = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [showVictory, setShowVictory] = useState(false);

  const startNew = (scenarioId: ScenarioId, slot: number) => {
    setSlotFn(slot);
    dispatch({ type: "RESET", scenarioId });
    setStarted(true);
  };
  const startContinue = (slot: number) => { load(slot); setStarted(true); };

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

  // Victory detection
  const prevWon = useRef(false);
  useEffect(() => {
    if (state.gameWon && !prevWon.current) { setShowVictory(true); }
    prevWon.current = !!state.gameWon;
  }, [state.gameWon]);

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

  if (!started) {
    return (
      <>
        <Animations />
        <TitleScreen slots={listSaveSlots()} onNew={startNew} onContinue={startContinue} />
      </>
    );
  }

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
          background: BURGUNDY, color: C.brassBright, textAlign: "center",
          padding: "10px 16px", fontSize: 14, fontWeight: 700, fontFamily: FONTS.heading,
          borderBottom: `1px solid ${C.brass}`,
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

      {/* ── Scenario progress bar ───────────────────────────── */}
      {state.scenarioId && state.scenarioId !== "sandbox" && (() => {
        const sc = SCENARIOS.find((x) => x.id === state.scenarioId);
        if (!sc) return null;
        const prog = sc.progress(state);
        const pct = Math.min(1, prog.value / prog.max);
        const leadRival = state.competitors.length > 0
          ? state.competitors.reduce(
              (best, c) =>
                rivalScenarioProgress(c, state.scenarioId!, state) >
                rivalScenarioProgress(best, state.scenarioId!, state)
                  ? c : best,
              state.competitors[0],
            )
          : null;
        const rivalPct = leadRival ? rivalScenarioProgress(leadRival, state.scenarioId!, state) : 0;
        return (
          <div style={{ background: C.woodDark, padding: "4px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.brass}44` }}>
            <span style={{ fontSize: 11, color: C.brass, fontWeight: 700, whiteSpace: "nowrap" }}>{sc.icon} {sc.title}</span>
            {/* Player bar */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ height: 5, background: "#2a1a0a", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? "#ffd700" : C.brass, borderRadius: 3, transition: "width 0.5s" }} />
              </div>
              {leadRival && (
                <div style={{ height: 4, background: "#2a1a0a", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${rivalPct * 100}%`, height: "100%", background: rivalPct > pct ? "#f87a7a" : "#888", borderRadius: 3, transition: "width 0.5s" }} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 10, color: C.creamSoft, whiteSpace: "nowrap" }}>Du: {prog.label}</span>
              {leadRival && (
                <span style={{ fontSize: 10, color: rivalPct > pct ? "#f87a7a" : "#aaa", whiteSpace: "nowrap" }}>
                  {leadRival.name}: {Math.round(rivalPct * 100)} %{rivalPct > pct ? " ⚠️" : ""}
                </span>
              )}
            </div>
          </div>
        );
      })()}

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

        {tab === "market" && <MarketPanel state={state} dispatch={dispatch} />}

        {tab === "map" && <CityMap state={state} dispatch={dispatch} />}

        {tab === "build" && <BuildPanel state={state} dispatch={dispatch} />}

        {tab === "stocks" && <StockExchange state={state} dispatch={dispatch} />}

        {tab === "research" && <ResearchPanel state={state} dispatch={dispatch} />}

        {tab === "staff" && <StaffPanel state={state} dispatch={dispatch} />}

        {tab === "group" && <GroupOverview state={state} dispatch={dispatch} />}

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

        {tab === "overview"    && <PortfolioTable state={state} dispatch={dispatch} />}
        {tab === "acquisition" && <AcquisitionPanel state={state} dispatch={dispatch} />}
        {tab === "districts"   && <DistrictPanel state={state} dispatch={dispatch} />}
        {tab === "calendar"    && <ContractCalendar state={state} />}
        {tab === "kpi"         && <KPIPanel state={state} dispatch={dispatch} />}
        {tab === "tenants"     && <TenantPanel state={state} dispatch={dispatch} />}
        {tab === "milestones"  && <MilestonesPanel state={state} />}
        {tab === "nyheter"     && <NewsFeedPanel state={state} />}
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

      {/* ── Victory overlay ─────────────────────────────────── */}
      {showVictory && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,20,10,0.85)", zIndex: 2500,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "linear-gradient(165deg, #f6efdc, #e6d6b4)", border: `2px solid ${C.brass}`, borderRadius: 8,
            padding: "36px 44px", maxWidth: 480, width: "100%", textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 26, fontWeight: 900, color: BURGUNDY, marginBottom: 6 }}>
              Seger!
            </div>
            {(() => {
              const sc = SCENARIOS.find((x) => x.id === state.scenarioId);
              const totalRentEarned = state.portfolio.reduce((a, p) => a + (p.totalEarnedRent ?? 0), 0);
              const portfolioVal = state.portfolio.reduce((a, p) => a + p.askPrice, 0);
              const milestonesCount = (state.milestones ?? []).length;
              return (
                <>
                  {sc && (
                    <div style={{ fontSize: 15, color: C.inkSoft, marginBottom: 12 }}>
                      {sc.title}: {sc.subtitle}<br />
                      <span style={{ fontSize: 13 }}>Spelat klart år {state.year}, månad {state.month}</span>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18, textAlign: "left" }}>
                    {[
                      ["Eget kapital", msek(equity)],
                      ["Portföljvärde", msek(portfolioVal)],
                      ["Fastigheter", `${state.portfolio.length} st`],
                      ["Totalt i hyror", msek(totalRentEarned)],
                      ["Reputation", `${Math.round(state.reputation)}`],
                      ["Milstolpar", `${milestonesCount} / 10`],
                    ].map(([label, val]) => (
                      <div key={label as string} style={{ background: "#f0e8d0", borderRadius: 4, padding: "8px 12px" }}>
                        <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: BURGUNDY }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setShowVictory(false)}
                style={{ padding: "10px 24px", borderRadius: 4, border: `1px solid ${C.brass}`, background: "transparent", color: C.ink, fontWeight: 700, cursor: "pointer" }}
              >
                Fortsätt spela
              </button>
              <button
                onClick={() => { setShowVictory(false); dispatch({ type: "RESET" }); setStarted(false); }}
                style={{ padding: "10px 24px", borderRadius: 4, border: `1px solid ${C.brass}`, background: BURGUNDY, color: C.brassBright, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body }}
              >
                Nytt spel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reaktiva lager ──────────────────────────────────── */}
      <Toasts log={state.log} />
      {showOffers && (
        <OffersModal state={state} dispatch={dispatch} onClose={() => setShowOffers(false)} />
      )}
      <DecisionModal state={state} dispatch={dispatch} />
      <OnboardingOverlay state={state} dispatch={dispatch} />

      {/* ── Competing bid banner ────────────────────────────── */}
      {state.competingBid && (() => {
        const cb = state.competingBid!;
        const listing = state.listings.find((p) => p.id === cb.listingId);
        return (
          <div style={{
            position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
            background: "#1a0a00", border: `2px solid ${BURGUNDY}`, borderRadius: 8,
            padding: "14px 20px", zIndex: 9999, maxWidth: 460, width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontFamily: FONTS.heading, color: BURGUNDY, fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
              ⚡ BUDGIVNING PÅGÅR
            </div>
            <div style={{ fontSize: 13, color: C.parchment, marginBottom: 12 }}>
              {cb.rivalName} har lagt <strong style={{ color: C.gold }}>{(cb.amount / 1_000_000).toFixed(1)} MSEK</strong>
              {listing ? ` på ${listing.typeLabel} i ${listing.districtName}` : ""}.
              Slå budet för att vinna!
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => dispatch({ type: "ACCEPT_COMPETING_BID" })}
                style={{ flex: 1, padding: "9px", background: BURGUNDY, color: C.parchment, border: "none", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13 }}
              >
                Lägg motbud ({cb.rivalName}s pris +1 %)
              </button>
              <button
                onClick={() => dispatch({ type: "PASS_COMPETING_BID" })}
                style={{ padding: "9px 14px", background: "transparent", color: C.creamSoft, border: `1px solid ${C.brass}55`, borderRadius: 4, cursor: "pointer", fontFamily: FONTS.body, fontSize: 12 }}
              >
                Låt dem köpa
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Lokala stilar ────────────────────────────────────────────────

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  overflowX: "auto",
  background: C.wood,
  borderBottom: `1px solid ${C.brass}`,
  flexShrink: 0,
  WebkitOverflowScrolling: "touch",
};

const tabStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "11px 18px",
  fontFamily: FONTS.heading,
  fontSize: 14,
  fontWeight: 600,
  color: C.creamSoft,
  borderBottom: "2px solid transparent",
  marginBottom: -1,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  letterSpacing: 0.3,
};

const tabActiveStyle: React.CSSProperties = {
  color: C.brassBright,
  borderBottom: `2px solid ${C.brass}`,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "18px",
  background: "transparent",
  WebkitOverflowScrolling: "touch",
};
