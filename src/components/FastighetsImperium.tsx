import { useEffect, useState } from "react";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { propNOI } from "../engine/property";
import { useGameClock } from "../hooks/useGameClock";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";
import { L } from "../styles/layout";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { CityCanvas } from "../three/CityCanvas";
import { ClockControls } from "./ClockControls";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { LogPanel } from "./LogPanel";
import { PortfolioCard } from "./PortfolioCard";
import { RivalsPanel } from "./RivalsPanel";
import { SelectionPanel } from "./SelectionPanel";
import { Stat } from "./Stat";
import { Tabs } from "./Tabs";

export default function FastighetsImperium() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const save = useGameStore((s) => s.save);
  const load = useGameStore((s) => s.load);
  const select = useUiStore((s) => s.select);

  // Spelklockan – rullande månadsticks med autospar (fas 0.5).
  useGameClock();

  const [tab, setTab] = useState("portfolio");
  const [saved, setSaved] = useState(false);

  const doSave = () => {
    save();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const equity = equityOf(state);
  const monthlyNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state) / 12, 0);
  const terms = loanTerms(state);
  const monthlyInterest = (state.debt * (terms.rate / 100)) / 12;
  const ltv = ltvOf(state);
  const myRank =
    [...state.competitors.map((c) => c.equity), equity].sort((a, b) => b - a).indexOf(equity) + 1;

  // Rensa valet när spelet nollställs/laddas till annat tillstånd.
  useEffect(() => {
    if (state.gameOver) select(null);
  }, [state.gameOver, select]);

  return (
    <div style={L.app}>
      <header style={L.topbar}>
        <div>
          <h1 style={L.title}>
            FASTIGHETS<span style={{ color: BURGUNDY }}>IMPERIUM</span>
          </h1>
          <div style={L.subtitle}>Förvärva · Bygg · Förvalta · Dominera</div>
        </div>
        <div style={L.statStrip}>
          <Stat
            label="Kassa"
            value={msek(state.cash)}
            accent={state.cash < 0 ? "#c0392b" : "#1a1a1a"}
          />
          <Stat
            label="Eget kapital"
            value={msek(equity)}
            accent={BURGUNDY}
            sub={`Rank #${myRank} av ${state.competitors.length + 1}`}
          />
          <Stat label="Skuld" value={msek(state.debt)} sub={`LTV ${pct(ltv)}`} />
          <Stat label="Låneränta" value={terms.rate + " %"} sub={`påslag +${terms.spread}`} />
          <Stat
            label="Driftnetto/mån"
            value={kr(monthlyNOI)}
            sub={`ränta −${kr(monthlyInterest)}`}
            accent={monthlyNOI - monthlyInterest >= 0 ? "#27660a" : "#c0392b"}
          />
          <Stat
            label="Reputation"
            value={Math.round(state.reputation)}
            sub={`max LTV ${pct(terms.maxLtv)}`}
            accent={BURGUNDY}
          />
        </div>
        <ClockControls />
        <div style={{ display: "flex", gap: 6 }}>
          <button style={S.miniBtn} onClick={doSave}>
            {saved ? "✓ Sparat" : "Spara"}
          </button>
          <button style={S.miniBtn} onClick={() => load()}>
            Ladda
          </button>
        </div>
      </header>

      <div style={L.main}>
        <div style={L.canvasWrap}>
          <CityCanvas />
          <button style={L.refreshFab} onClick={() => dispatch({ type: "REFRESH_LISTINGS" })}>
            ↻ Nya objekt på marknaden
          </button>
          <div style={L.ticker}>{state.log[0]?.t}</div>
          {state.gameOver && (
            <div style={L.gameOverWrap}>
              <div style={L.gameOverBox}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>💥 KONKURS</div>
                Spelet är slut. Eget kapital: {msek(equity)} efter {state.year} år.
                <div style={{ marginTop: 14 }}>
                  <button style={S.resetBtn} onClick={() => dispatch({ type: "RESET" })}>
                    Spela igen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside style={L.sidebar}>
          <div style={L.sidebarSelection}>
            <SelectionPanel />
          </div>
          <div style={L.sidebarTabs}>
            <Tabs
              tab={tab}
              setTab={setTab}
              items={[
                { id: "portfolio", label: `Portfölj (${state.portfolio.length})` },
                { id: "finance", label: "Finans" },
                { id: "rivals", label: "Konkurrenter" },
                { id: "log", label: "Händelser" },
              ]}
            />
          </div>
          <div style={L.sidebarContent}>
            {tab === "portfolio" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {state.portfolio.length === 0 && (
                  <div style={S.empty}>
                    Inga fastigheter ännu. Klicka på ett objekt med gul ring på kartan för att köpa,
                    eller en grön ring för att köpa tomt och bygga nytt.
                  </div>
                )}
                {state.portfolio.map((p) => (
                  <PortfolioCard key={p.id} p={p} state={state} dispatch={dispatch} />
                ))}
              </div>
            )}
            {tab === "finance" && (
              <div>
                <EquityChart history={state.history} />
                <FinancePanel
                  state={state}
                  dispatch={dispatch}
                  equity={equity}
                  ltv={ltv}
                  terms={terms}
                />
              </div>
            )}
            {tab === "rivals" && <RivalsPanel state={state} equity={equity} />}
            {tab === "log" && <LogPanel log={state.log} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
