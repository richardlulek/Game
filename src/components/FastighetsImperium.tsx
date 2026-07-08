import { useEffect, useRef, useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "../audio/sound";
import { canUpgrade, tierForLevel, unlockLevelFor, unlockedWindows } from "../engine/company";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { msek } from "../engine/format";
import { propNOI } from "../engine/property";
import { SCENARIOS, rivalScenarioProgress } from "../engine/scenarios";
import type { ScenarioId } from "../engine/types";
import { useGameClock } from "../hooks/useGameClock";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { listSaveSlots } from "../store/persistence";
import { S } from "../styles/styles";
import { BURGUNDY, C, FONTS } from "../styles/tokens";
import { Animations } from "./Animations";
import { BuildPanel } from "./BuildPanel";
import { DecisionModal } from "./DecisionModal";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { CityCanvas } from "../three/CityCanvas";
import { FloatingWindow } from "./FloatingWindow";
import { MapLegend, MapSelectionCard, OverlayToggle, TodoHud } from "./MapOverlays";
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
import { ResearchPanel } from "./ResearchPanel";
import { StaffPanel } from "./StaffPanel";
import { AcquisitionPanel } from "./AcquisitionPanel";
import { DistrictPanel } from "./DistrictPanel";
import { ContractCalendar } from "./ContractCalendar";
import { TenantPanel } from "./TenantPanel";
import { NewsFeedPanel } from "./NewsFeedPanel";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { IndustryPanel } from "./IndustryPanel";
import { IndustryMarket } from "./IndustryMarket";
import { CompanyHub } from "./CompanyHub";
import { NewspaperModal } from "./NewspaperModal";
import { AuctionModal } from "./AuctionModal";
import { PolicyPanel } from "./PolicyPanel";

/** Ikon per fönster (Capitalism-stil ikonverktygsrad). */
const TAB_ICONS: Record<string, string> = {
  company: "🏠",
  policy: "📋",
  portfolio: "📁",
  market: "🏷️",
  build: "🏗️",
  tenants: "👥",
  calendar: "📅",
  finance: "💰",
  stocks: "📈",
  acquisition: "🤝",
  industri: "🏭",
  ind_marknad: "🛒",
  staff: "👔",
  research: "🔬",
  districts: "🗺️",
  rivals: "🏆",
  nyheter: "📰",
  log: "📜",
};

/** Grupperna i verktygsraden: Fastighet | Finans | Bolag | Stad.
    Bolagsinfo (Koncern/Översikt/KPI/Milstolpar) ligger som flikar i
    Bolag-fönstret i stället för egna ikoner. */
const TAB_GROUPS: string[][] = [
  ["portfolio", "market", "build", "tenants", "calendar"],
  ["finance", "stocks", "acquisition", "industri", "ind_marknad"],
  ["policy", "staff", "research"],
  ["districts", "rivals", "nyheter", "log"],
];

const TABS = [
  { id: "company",   label: "Bolag" },
  { id: "policy",    label: "Policy" },
  { id: "portfolio", label: "Portfölj" },
  { id: "market",    label: "Marknad" },
  { id: "build",     label: "Bygg" },
  { id: "stocks",    label: "Börs" },
  { id: "finance",   label: "Finans" },
  { id: "research",  label: "Forskning" },
  { id: "staff",     label: "Anställda" },
  { id: "rivals",    label: "Topp" },
  { id: "log",       label: "Logg" },
  { id: "acquisition",  label: "Förvärv" },
  { id: "districts",    label: "Distrikt" },
  { id: "calendar",     label: "Kalender" },
  { id: "tenants",      label: "Hyresgäster" },
  { id: "nyheter",      label: "Nyheter" },
  { id: "industri",    label: "Industri" },
  { id: "ind_marknad", label: "Ind. Marknad" },
];

export default function FastighetsImperium() {
  const state      = useGameStore((s) => s.state);
  const dispatch   = useGameStore((s) => s.dispatch);
  const save       = useGameStore((s) => s.save);
  const load       = useGameStore((s) => s.load);
  const setSlotFn  = useGameStore((s) => s.setSlot);

  // Rullande realtidsklocka (paus/1x/2x/4x i verktygsfältet).
  useGameClock();

  const [started, setStarted] = useState(false);
  // Undertrycker tidningsmodalen när en nivåändring kommer från load.
  const suppressNews = useRef(false);
  // Cap2-modell: kartan är alltid grundvyn; flera fönster kan vara öppna
  // samtidigt (ordningen = z-ordning, sist = överst). Minimerade fönster
  // ligger kvar i taskbaren.
  const [wins, setWins] = useState<string[]>([]);
  const [minimized, setMinimized] = useState<string[]>([]);
  const winsRef = useRef<{ wins: string[]; minimized: string[] }>({ wins: [], minimized: [] });
  winsRef.current = { wins, minimized };
  const [saved, setSaved]     = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [showVictory, setShowVictory] = useState(false);

  const startNew = (scenarioId: ScenarioId, slot: number, companyName: string) => {
    setSlotFn(slot);
    dispatch({ type: "RESET", scenarioId, companyName });
    setStarted(true);
  };
  const startContinue = (slot: number) => {
    suppressNews.current = true;
    load(slot);
    setStarted(true);
  };
  const doLoad = (slot?: number) => {
    suppressNews.current = true;
    load(slot);
  };

  // Fönsterhantering (Cap2: flera öppna, fokus lyfter överst).
  const openWindow = (id: string) => {
    setMinimized((m) => m.filter((x) => x !== id));
    setWins((w) => (w.includes(id) ? [...w.filter((x) => x !== id), id] : [...w, id]));
  };
  const closeWindow = (id: string) => {
    setWins((w) => w.filter((x) => x !== id));
    setMinimized((m) => m.filter((x) => x !== id));
  };
  const focusWindow = (id: string) => {
    setWins((w) => (w[w.length - 1] === id ? w : [...w.filter((x) => x !== id), id]));
  };
  const minimizeWindow = (id: string) => setMinimized((m) => (m.includes(id) ? m : [...m, id]));

  // Öppna-begäran från 3D-vyn (klick på statusikoner m.m.):
  // "offers" öppnar budinkorgen, annars ett fönster-id.
  const pendingOpen = useUiStore((s) => s.pendingOpen);
  const clearOpen = useUiStore((s) => s.clearOpen);
  useEffect(() => {
    if (!pendingOpen) return;
    if (pendingOpen === "offers") setShowOffers(true);
    else openWindow(pendingOpen);
    clearOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { wins: w, minimized: m } = winsRef.current;
      const visible = w.filter((id) => !m.includes(id));
      const top = visible[visible.length - 1];
      if (top) closeWindow(top);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
  const companyLevel    = state.companyLevel ?? 1;
  const unlocked        = unlockedWindows(companyLevel);
  const upgrade         = canUpgrade(state);

  // Stäng fönster som inte är upplåsta (t.ex. efter laddad sparfil).
  useEffect(() => {
    setWins((w) => (w.every((id) => unlocked.has(id)) ? w : w.filter((id) => unlocked.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLevel]);

  // Nivåhöjning → tidningsförstasida. Laddade sparfiler trycker inga
  // gamla nyheter (suppressNews sätts av load-vägarna nedan).
  const [newsLevel, setNewsLevel] = useState<number | null>(null);
  const prevLevel = useRef(companyLevel);
  useEffect(() => {
    if (companyLevel !== prevLevel.current) {
      if (companyLevel === prevLevel.current + 1 && !suppressNews.current)
        setNewsLevel(companyLevel);
      prevLevel.current = companyLevel;
    }
    suppressNews.current = false;
  }, [companyLevel]);

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
        state={state} dispatch={dispatch} saved={saved} onSave={doSave} onLoad={doLoad}
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

      {/* ── Ikonverktygsrad à la Capitalism (kartan är alltid grundvyn).
          Grupper: Fastighet | Finans | Bolag | Stad. Bolagsnivån styr
          vilka funktioner som är upplåsta. Klick öppnar/stänger fönster. */}
      <div style={tabBarStyle}>
        <button
          style={{
            ...tabStyle,
            ...companyBadgeStyle,
            ...(wins.includes("company") ? tabActiveStyle : {}),
            ...(upgrade.qualified ? { color: "#ffd700" } : {}),
          }}
          onClick={() => (wins.includes("company") ? closeWindow("company") : openWindow("company"))}
          title={upgrade.qualified ? "Bolaget är redo att expandera!" : "Öppna Bolag"}
        >
          {tierForLevel(companyLevel).icon} {state.companyName ?? "Mitt Fastighetsbolag"}
          {upgrade.qualified ? " ⬆" : ""}
        </button>
        {TAB_GROUPS.map((group, gi) => (
          <span key={gi} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {gi > 0 && <span style={groupDivider} />}
            {group.map((id) => {
              const t = TABS.find((x) => x.id === id)!;
              const locked = !unlocked.has(id);
              const open = wins.includes(id);
              const count =
                id === "portfolio"
                  ? state.portfolio.length
                  : id === "industri"
                    ? (state.industryPortfolio ?? []).length
                    : null;
              if (locked) {
                const reqTier = tierForLevel(unlockLevelFor(id));
                return (
                  <button
                    key={id}
                    style={{ ...iconTabStyle, opacity: 0.32, cursor: "default" }}
                    title={`🔒 ${t.label} – låses upp på nivå ${reqTier.level}: ${reqTier.name}`}
                  >
                    {TAB_ICONS[id] ?? "▫️"}
                  </button>
                );
              }
              return (
                <button
                  key={id}
                  style={{ ...iconTabStyle, ...(open ? iconTabActiveStyle : {}) }}
                  onClick={() => (open ? closeWindow(id) : openWindow(id))}
                  title={`${t.label}${count !== null ? ` (${count})` : ""} — ${open ? "stäng" : "öppna"}`}
                >
                  {TAB_ICONS[id] ?? "▫️"}
                  {count !== null && count > 0 && <span style={iconBadgeStyle}>{count}</span>}
                </button>
              );
            })}
          </span>
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

      {/* ── Kartan (grundvyn) + flytande fönster ─────────────── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <CityCanvas />
        </div>
        <MapLegend />
        <OverlayToggle />
        <TodoHud openWindow={(id) => unlocked.has(id) && openWindow(id)} />
        <MapSelectionCard openWindow={(id) => unlocked.has(id) && openWindow(id)} />
        {wins.map((id, i) => {
          if (minimized.includes(id)) return null;
          const windowContent = (): React.ReactNode => {
            switch (id) {
              case "company": return <CompanyHub state={state} dispatch={dispatch} />;
              case "policy": return <PolicyPanel state={state} dispatch={dispatch} />;
              case "portfolio":
                return (
                  <div style={S.grid}>
                    {state.portfolio.length === 0 && (
                      <div style={S.empty}>
                        Inga fastigheter ännu. Gå till <strong>Marknad</strong> eller{" "}
                        <strong>Bygg</strong> – eller klicka på ett objekt med gul ring på kartan.
                      </div>
                    )}
                    {state.portfolio.map((p) => (
                      <PortfolioCard key={p.id} p={p} state={state} dispatch={dispatch} />
                    ))}
                  </div>
                );
              case "market": return <MarketPanel state={state} dispatch={dispatch} />;
              case "build": return <BuildPanel state={state} dispatch={dispatch} />;
              case "stocks": return <StockExchange state={state} dispatch={dispatch} />;
              case "research": return <ResearchPanel state={state} dispatch={dispatch} />;
              case "staff": return <StaffPanel state={state} dispatch={dispatch} />;
              case "finance":
                return (
                  <>
                    <FinancePanel state={state} dispatch={dispatch} equity={equity} ltv={ltv} terms={terms} />
                    <div style={{ marginTop: 18 }}>
                      <EquityChart history={state.history} />
                    </div>
                  </>
                );
              case "rivals": return <RivalsPanel state={state} equity={equity} />;
              case "log": return <LogPanel log={state.log} />;
              case "acquisition": return <AcquisitionPanel state={state} dispatch={dispatch} />;
              case "districts": return <DistrictPanel state={state} dispatch={dispatch} />;
              case "calendar": return <ContractCalendar state={state} />;
              case "tenants": return <TenantPanel state={state} dispatch={dispatch} />;
              case "nyheter": return <NewsFeedPanel state={state} />;
              case "industri": return <IndustryPanel state={state} dispatch={dispatch} />;
              case "ind_marknad": return <IndustryMarket state={state} dispatch={dispatch} />;
              default: return null;
            }
          };
          return (
            <FloatingWindow
              key={id}
              title={TABS.find((t) => t.id === id)?.label ?? ""}
              zIndex={60 + i}
              offsetIndex={wins.indexOf(id) % 6}
              onFocus={() => focusWindow(id)}
              onMinimize={() => minimizeWindow(id)}
              onClose={() => closeWindow(id)}
            >
              {windowContent()}
            </FloatingWindow>
          );
        })}
      </div>

      {/* ── Taskbar: öppna fönster à la Capitalism ──────────── */}
      {wins.length > 0 && (
        <div style={taskbarStyle}>
          {wins.map((id) => {
            const isMin = minimized.includes(id);
            const isTop = !isMin && wins.filter((x) => !minimized.includes(x)).slice(-1)[0] === id;
            return (
              <button
                key={id}
                style={{
                  ...taskbarBtnStyle,
                  ...(isTop ? { background: C.burgundy, color: C.brassBright } : {}),
                  ...(isMin ? { opacity: 0.55 } : {}),
                }}
                title={isMin ? "Återställ" : isTop ? "Minimera" : "Fokusera"}
                onClick={() => {
                  if (isMin) openWindow(id);
                  else if (isTop) minimizeWindow(id);
                  else focusWindow(id);
                }}
              >
                {TAB_ICONS[id] ?? "▫️"} {TABS.find((t) => t.id === id)?.label ?? id}
              </button>
            );
          })}
        </div>
      )}

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
            background: "linear-gradient(165deg, #eef2f7, #d6dfeb)", border: `2px solid ${C.brass}`, borderRadius: 8,
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
                      <div key={label as string} style={{ background: "#e4eaf2", borderRadius: 4, padding: "8px 12px" }}>
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
      {newsLevel !== null && (
        <NewspaperModal state={state} level={newsLevel} onClose={() => setNewsLevel(null)} />
      )}
      <AuctionModal state={state} dispatch={dispatch} />
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

/** Bolagsknappen – alltid först, med guldkant så ägarskapet syns. */
const companyBadgeStyle: React.CSSProperties = {
  color: C.brassBright,
  fontWeight: 800,
  borderRight: `1px solid ${C.brass}55`,
  maxWidth: 260,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** Ikonknappar i verktygsraden. */
const iconTabStyle: React.CSSProperties = {
  position: "relative",
  background: "none",
  border: "none",
  padding: "9px 11px",
  fontSize: 17,
  lineHeight: 1,
  cursor: "pointer",
  borderBottom: "2px solid transparent",
  marginBottom: -1,
  flexShrink: 0,
};

const iconTabActiveStyle: React.CSSProperties = {
  borderBottom: `2px solid ${C.brass}`,
  background: "rgba(255,255,255,0.07)",
};

const iconBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 2,
  right: 1,
  background: C.burgundy,
  color: "#fff",
  fontSize: 9,
  fontWeight: 800,
  borderRadius: 7,
  minWidth: 14,
  height: 14,
  lineHeight: "14px",
  textAlign: "center",
  padding: "0 2px",
};

const groupDivider: React.CSSProperties = {
  width: 1,
  height: 22,
  background: `${C.brass}55`,
  margin: "0 7px",
  display: "inline-block",
};

/** Taskbar för öppna/minimerade fönster, ovanför statusraden. */
const taskbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "4px 10px",
  background: C.woodDark,
  borderTop: `1px solid ${C.brass}44`,
  overflowX: "auto",
  flexShrink: 0,
};

const taskbarBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${C.brass}44`,
  color: C.creamSoft,
  borderRadius: 5,
  padding: "4px 11px",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: FONTS.heading,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

