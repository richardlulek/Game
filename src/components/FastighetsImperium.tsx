import { useEffect, useRef, useState } from "react";
import {
  isSoundEnabled, setSoundEnabled,
  startMusic, stopMusic, setMusicMood, setMusicTempo,
  playLevelUp, playMilestone, playBell, playAlert, playBuild, playTick,
  playCarArrive, playChapter,
} from "../audio/sound";
import { canUpgrade, tierForLevel, unlockLevelFor, unlockedWindows } from "../engine/company";
import { formatGameDate } from "../engine/date";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { msek } from "../engine/format";
import { propMarketValue, propNOI, propYieldOnCost } from "../engine/property";
import { SCENARIOS, rivalScenarioProgress } from "../engine/scenarios";
import { CHAPTER_FRONTS, STORY_CINEMATICS, cinematicPointFor, type StoryFront } from "../engine/story";
import type { InitOptions, ScenarioId } from "../engine/types";
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
import { PortfolioSummaryCard } from "./PortfolioSummaryCard";
import { PortfolioTable } from "./PortfolioTable";
import { RivalsPanel } from "./RivalsPanel";
import { StatusBar } from "./StatusBar";
import { MemoryNoteCard } from "./MemoryNoteCard";
import { StoryHud } from "./StoryHud";
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
import { StatsPanel } from "./StatsPanel";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { IndustryPanel } from "./IndustryPanel";
import { IndustryMarket } from "./IndustryMarket";
import { CompanyHub } from "./CompanyHub";
import { NewspaperModal } from "./NewspaperModal";
import { AuctionModal } from "./AuctionModal";
import { ReceivershipModal } from "./ReceivershipModal";
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
  rivals: "🕶️",
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
  { id: "company",   label: "Company" },
  { id: "policy",    label: "Policy" },
  { id: "portfolio", label: "Portfolio" },
  { id: "market",    label: "Market" },
  { id: "build",     label: "Build" },
  { id: "stocks",    label: "Stocks" },
  { id: "finance",   label: "Finance" },
  { id: "research",  label: "Research" },
  { id: "staff",     label: "Staff" },
  { id: "rivals",    label: "Rivals" },
  { id: "log",       label: "Log" },
  { id: "acquisition",  label: "Acquisitions" },
  { id: "districts",    label: "Districts" },
  { id: "calendar",     label: "Calendar" },
  { id: "tenants",      label: "Tenants" },
  { id: "nyheter",      label: "News" },
  { id: "statistik",    label: "Stats" },
  { id: "industri",    label: "Industry" },
  { id: "ind_marknad", label: "Ind. Market" },
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
  const clockSpeed = useGameStore((s) => s.clock.speed);
  // Portföljvyn: kompakt lista (skannbar, för många fastigheter) eller
  // detaljerade kort. Default styrs av antalet fastigheter.
  const [portfolioView, setPortfolioView] = useState<"list" | "cards">(
    () => (state.portfolio.length > 4 ? "list" : "cards"),
  );
  // Sortering i kort-vyn (listan har egen kolumnsortering).
  const [portfolioSort, setPortfolioSort] = useState<"value" | "yield" | "condition" | "noi" | "vacant">("value");
  // Utfällt kort i kort-vyn (master-detail): null = alla visas kompakt.
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);

  const startNew = (scenarioId: ScenarioId, slot: number, companyName: string, options?: InitOptions) => {
    setSlotFn(slot);
    // "arvet" = berättelseläget: eget startläge (morfars hus + fryspåsen).
    dispatch({
      type: "RESET",
      scenarioId,
      companyName,
      ...(scenarioId === "arvet" ? { mode: "story" as const } : {}),
      ...(options ? { options } : {}),
    });
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

  // Berättelseläget levande: kameran glider till kapitlets plats – morfars hus
  // vid arvet, dödsboet i bankkapitlet, grannhuset i revanschen. Glidningen
  // sker medan brevet läses, så man landar mitt i scenen när modalen stängs.
  const storyBeat = state.story?.beat;
  const storyDone = state.story?.done;
  useEffect(() => {
    if (!started || !storyBeat || storyDone) return;
    const TARGET_TAG: Record<string, string> = {
      prolog: "arvet", renoveringen: "arvet", hyresgasten: "arvet",
      forhandlingen: "arvet", banken: "dödsbo", konjunkturen: "arvet",
      bolaget: "arvet", revanschen: "revansch", dynastin: "arvet",
    };
    const tag = TARGET_TAG[storyBeat];
    if (!tag) return;
    const st = useGameStore.getState().state;
    const target =
      st.portfolio.find((p) => p.storyTag === tag) ??
      st.listings.find((p) => p.storyTag === tag) ??
      st.portfolio.find((p) => p.storyTag === "arvet");
    if (target?.parcelId) useUiStore.getState().requestFocus(target.parcelId);
  }, [started, storyBeat, storyDone]);

  // STADSBLADETs förstasida när ett kapitel klaras: beatet man LÄMNAR firas.
  // Tidningen (zIndex 2600) lägger sig över nästa kapitels brev (2000), så
  // sekvensen blir naturlig: löpsedel → stäng → regipaus → morfars nästa brev.
  const [storyFront, setStoryFront] = useState<StoryFront | null>(null);
  const prevBeat = useRef<string | undefined>(storyBeat);
  useEffect(() => {
    const left = prevBeat.current;
    prevBeat.current = storyBeat;
    if (!started || !left || left === storyBeat) return;
    const front = CHAPTER_FRONTS[left];
    if (front && !suppressNews.current) setStoryFront(front);
    // Kapitelfanfar – men inte när beatet byts av en laddad sparfil.
    if (!suppressNews.current) playChapter();
  }, [started, storyBeat]);

  // Berättelseregi: vissa brev föregås av en scen. Modalen hålls dold av
  // DecisionModal så länge cinematic-pausen pågår; kameran glider under
  // tiden in i närbild eller sveper till kapitlets plats (och Rogges bil
  // rullar in när regin säger det). Klick eller tangent hoppar över pausen.
  // Klockan står stilla ändå, eftersom pendingDecision pausar simuleringen.
  // Ligger en STADSBLADET-förstasida överst hålls scenen tills den stängts,
  // så ordningen blir löpsedel → regipaus → brev.
  const cinematic = useUiStore((s) => s.cinematic);
  const pendingId = state.pendingDecision?.id;
  const frontOpen = storyFront !== null;
  useEffect(() => {
    if (!started || !pendingId) return;
    const cine = STORY_CINEMATICS[pendingId];
    if (!cine) return;
    const done = () => useUiStore.getState().setCinematic(null);
    if (frontOpen) {
      // Vänta bakom tidningen: håll brevet dolt men rör inte kameran än.
      const now = Date.now();
      useUiStore.getState().setCinematic({
        id: pendingId, start: now, until: now + 10 * 60_000, hint: cine.hint,
      });
      return done;
    }
    if (cine.car) playCarArrive(); // tystas av ljudmodulen om ljud är av
    if (cine.focusDistrict) {
      const pt = cinematicPointFor(cine.focusDistrict);
      useUiStore.getState().requestFocusPoint(pt.x, pt.z, cine.zoom);
    } else if (cine.focusTag) {
      const st = useGameStore.getState().state;
      const target =
        st.portfolio.find((p) => p.storyTag === cine.focusTag) ??
        st.listings.find((p) => p.storyTag === cine.focusTag);
      if (target?.parcelId) useUiStore.getState().requestFocus(target.parcelId, cine.zoom);
    }
    const now = Date.now();
    useUiStore.getState().setCinematic({
      id: pendingId, start: now, until: now + cine.holdMs, car: cine.car, hint: cine.hint,
    });
    const t = window.setTimeout(done, cine.holdMs);
    const skip = () => { window.clearTimeout(t); done(); };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      done();
    };
  }, [started, pendingId, frontOpen]);

  // Månadspuls – ett kort svep när månaden växlar.
  const [pulseKey, setPulseKey] = useState(0);
  const absMonth = state.year * 12 + state.month;
  const prevMonth = useRef(absMonth);
  useEffect(() => {
    if (absMonth !== prevMonth.current) {
      prevMonth.current = absMonth;
      setPulseKey((k) => k + 1);
      if (soundOn && started) playTick();
    }
  }, [absMonth, soundOn, started]);

  // Victory detection
  const prevWon = useRef(false);
  useEffect(() => {
    if (state.gameWon && !prevWon.current) { setShowVictory(true); }
    prevWon.current = !!state.gameWon;
  }, [state.gameWon]);

  // ── Ambient-musik: startar när spelet är igång och ljud på ──────────────
  useEffect(() => {
    if (started && soundOn) startMusic();
    else stopMusic();
  }, [started, soundOn]);
  // Humöret följer konjunkturen, tempot klockan.
  useEffect(() => {
    setMusicMood(state.marketCycle?.phase ?? "stable");
  }, [state.marketCycle?.phase]);
  useEffect(() => {
    setMusicTempo(clockSpeed || 1);
  }, [clockSpeed]);

  // ── Händelse-SFX: bevakar nyckeltillstånd och spelar en signatur vid övergång.
  const sfxPrev = useRef({ level: state.companyLevel ?? 1, ms: 0, ipo: false, bid: false, logTop: "" });
  useEffect(() => {
    const level = state.companyLevel ?? 1;
    if (!soundOn || !started) {
      sfxPrev.current = {
        level,
        ms: state.milestones?.length ?? 0,
        ipo: !!state.ipoActive,
        bid: !!state.competingBid,
        logTop: state.log[0]?.t ?? "",
      };
      return;
    }
    const p = sfxPrev.current;
    if (level > p.level) playLevelUp();
    const ms = state.milestones?.length ?? 0;
    if (ms > p.ms) playMilestone();
    const ipo = !!state.ipoActive;
    if (ipo && !p.ipo) playBell();
    const bid = !!state.competingBid;
    if (bid && !p.bid) playAlert();
    const logTop = state.log[0]?.t ?? "";
    if (logTop && logTop !== p.logTop &&
        /Started new construction|Development project started|Demolition & rebuild started/.test(logTop)) {
      playBuild();
    }
    sfxPrev.current = { level, ms, ipo, bid, logTop };
  }, [state, soundOn, started]);

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
        state={state} saved={saved} onSave={doSave} onLoad={doLoad}
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
          Game over — {state.year} years played
          <button
            style={{ ...S.toolbarNextBtn, padding: "5px 14px", fontSize: 13 }}
            onClick={() => dispatch({ type: "RESET" })}
          >
            Play again
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
          title={upgrade.qualified ? "The company is ready to expand!" : "Open Company"}
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
                    title={`🔒 ${t.label} – unlocks at level ${reqTier.level}: ${reqTier.name}`}
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
                  title={`${t.label}${count !== null ? ` (${count})` : ""} — ${open ? "close" : "open"}`}
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
        {/* Egen stackningskontext (isolation) så att 3D-vyns HTML-etiketter
            (distriktsnamn, statusikoner via drei <Html>) hålls som ETT lager
            längst ned – de kan annars lyfta sitt z-index förbi kartans HUD,
            kort och öppna fönster/flikar och "lysa igenom" dem. */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, isolation: "isolate", overflow: "hidden" }}>
          <CityCanvas />
        </div>
        <MapLegend />
        <OverlayToggle />
        <TodoHud openWindow={(id) => unlocked.has(id) && openWindow(id)} />
        <StoryHud />
        <MapSelectionCard openWindow={(id) => unlocked.has(id) && openWindow(id)} />
        <MemoryNoteCard />
        {wins.map((id, i) => {
          if (minimized.includes(id)) return null;
          const windowContent = (): React.ReactNode => {
            switch (id) {
              case "company": return <CompanyHub state={state} dispatch={dispatch} />;
              case "policy": return <PolicyPanel state={state} dispatch={dispatch} />;
              case "portfolio":
                return (
                  <div>
                    {state.portfolio.length === 0 ? (
                      <div style={S.empty}>
                        No properties yet. Go to <strong>Market</strong> or{" "}
                        <strong>Build</strong> – or click an object with a yellow ring on the map.
                      </div>
                    ) : (
                      <>
                        {/* Vyväxlare: kompakt lista (skannbar) eller detaljkort. */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.brassBright, fontSize: 15 }}>
                            {state.portfolio.length} {state.portfolio.length === 1 ? "fastighet" : "fastigheter"}
                          </span>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {portfolioView === "cards" && (
                              <select
                                value={portfolioSort}
                                onChange={(e) => setPortfolioSort(e.target.value as typeof portfolioSort)}
                                title="Sortera korten"
                                style={{
                                  height: 30, borderRadius: 6, fontSize: 12, fontWeight: 700,
                                  fontFamily: FONTS.body, padding: "0 8px", cursor: "pointer",
                                  border: `1px solid ${C.brassDim}`, background: C.wood, color: C.brassBright,
                                }}
                              >
                                <option value="value">Value ↓</option>
                                <option value="yield">Yield ↓</option>
                                <option value="condition">Skick ↓</option>
                                <option value="noi">NOI ↓</option>
                                <option value="vacant">Vakanser ↓</option>
                              </select>
                            )}
                            {(["list", "cards"] as const).map((v) => (
                              <button
                                key={v}
                                onClick={() => setPortfolioView(v)}
                                style={{
                                  padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  fontFamily: FONTS.body, letterSpacing: 0.3,
                                  border: `1px solid ${portfolioView === v ? C.brass : C.brassDim}`,
                                  background: portfolioView === v ? BURGUNDY : "transparent",
                                  color: portfolioView === v ? C.brassBright : C.creamSoft,
                                }}
                              >
                                {v === "list" ? "☰ List" : "▦ Cards"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {portfolioView === "list" ? (
                          <PortfolioTable state={state} dispatch={dispatch} />
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
                            {[...state.portfolio]
                              .sort((a, b) => {
                                switch (portfolioSort) {
                                  case "value": return propMarketValue(b, state) - propMarketValue(a, state);
                                  case "yield": return propYieldOnCost(b, state) - propYieldOnCost(a, state);
                                  case "condition": return b.condition - a.condition;
                                  case "noi": return propNOI(b, state) - propNOI(a, state);
                                  case "vacant": return (b.capacity - b.tenants.length) - (a.capacity - a.tenants.length);
                                  default: return 0;
                                }
                              })
                              .map((p) => {
                                const isOpen = expandedCardId === p.id;
                                // Utfällt kort spänner över hela rutnätsbredden så
                                // det fullständiga förvaltningskortet får plats.
                                return isOpen ? (
                                  <div key={p.id} style={{ gridColumn: "1 / -1" }}>
                                    <PortfolioSummaryCard p={p} state={state} open onToggle={() => setExpandedCardId(null)} />
                                    <div style={{ marginTop: 12 }}>
                                      <PortfolioCard p={p} state={state} dispatch={dispatch} wide />
                                    </div>
                                  </div>
                                ) : (
                                  <PortfolioSummaryCard
                                    key={p.id}
                                    p={p}
                                    state={state}
                                    open={false}
                                    onToggle={() => setExpandedCardId(p.id)}
                                  />
                                );
                              })}
                          </div>
                        )}
                      </>
                    )}
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
              case "nyheter": return <NewsFeedPanel state={state} onBuyPr={() => dispatch({ type: "BUY_PR" })} />;
              case "statistik": return <StatsPanel state={state} />;
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
                title={isMin ? "Restore" : isTop ? "Minimize" : "Focus"}
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
              Victory!
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
                      <span style={{ fontSize: 13 }}>Completed {formatGameDate(state.day ?? 1, state.month, state.year)}</span>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18, textAlign: "left" }}>
                    {[
                      ["Equity", msek(equity)],
                      ["Portfolio value", msek(portfolioVal)],
                      ["Properties", `${state.portfolio.length}`],
                      ["Total rent earned", msek(totalRentEarned)],
                      ["Reputation", `${Math.round(state.reputation)}`],
                      ["Milestones", `${milestonesCount} / 10`],
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
                Keep playing
              </button>
              <button
                onClick={() => { setShowVictory(false); dispatch({ type: "RESET" }); setStarted(false); }}
                style={{ padding: "10px 24px", borderRadius: 4, border: `1px solid ${C.brass}`, background: BURGUNDY, color: C.brassBright, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body }}
              >
                New game
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
      {storyFront && (
        <NewspaperModal state={state} front={storyFront} onClose={() => setStoryFront(null)} />
      )}
      {newsLevel !== null && (
        <NewspaperModal state={state} level={newsLevel} onClose={() => setNewsLevel(null)} />
      )}
      <AuctionModal state={state} dispatch={dispatch} />
      <ReceivershipModal state={state} dispatch={dispatch} />
      <DecisionModal state={state} dispatch={dispatch} />
      {cinematic && (
        <div
          style={{
            position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)",
            zIndex: 1900, background: "rgba(20,14,8,0.82)", border: `1px solid ${C.brass}`,
            color: C.brassBright, borderRadius: 20, padding: "7px 18px",
            fontFamily: FONTS.heading, fontSize: 13, whiteSpace: "nowrap",
            animation: "fi-overlay-fade 0.5s ease", pointerEvents: "none",
          }}
        >
          {cinematic.hint ?? "…"}{" "}
          <span style={{ opacity: 0.55, fontSize: 11 }}>· click to continue</span>
        </div>
      )}
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
              ⚡ BIDDING WAR{cb.round && cb.round > 1 ? ` · ROUND ${cb.round}` : ""}
            </div>
            <div style={{ fontSize: 13, color: C.parchment, marginBottom: 12 }}>
              {cb.rivalName} bid <strong style={{ color: C.gold }}>{(cb.amount / 1_000_000).toFixed(1)} MSEK</strong>
              {listing ? ` on ${listing.typeLabel} in ${listing.districtName}` : ""}.
              Raise your bid 2% to push them – they can counter for up to three rounds.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => dispatch({ type: "ACCEPT_COMPETING_BID" })}
                style={{ flex: 1, padding: "9px", background: BURGUNDY, color: C.parchment, border: "none", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body, fontSize: 13 }}
              >
                Raise the bid ({((cb.amount * 1.02) / 1_000_000).toFixed(1)} MSEK)
              </button>
              <button
                onClick={() => dispatch({ type: "PASS_COMPETING_BID" })}
                style={{ padding: "9px 14px", background: "transparent", color: C.creamSoft, border: `1px solid ${C.brass}55`, borderRadius: 4, cursor: "pointer", fontFamily: FONTS.body, fontSize: 12 }}
              >
                Let them buy
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

