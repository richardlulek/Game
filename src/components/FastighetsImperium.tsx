import { useState } from "react";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { propNOI } from "../engine/property";
import { useGameStore } from "../store/gameStore";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { BuildPanel } from "./BuildPanel";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { LogPanel } from "./LogPanel";
import { MapPanel } from "./MapPanel";
import { MarketTable } from "./MarketTable";
import { PortfolioTable } from "./PortfolioTable";
import { RivalsPanel } from "./RivalsPanel";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { msek } from "../engine/format";

export default function FastighetsImperium() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const save = useGameStore((s) => s.save);
  const load = useGameStore((s) => s.load);

  const [tab, setTab] = useState("portfolio");
  const [saved, setSaved] = useState(false);

  const doSave = () => {
    save();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const doLoad = () => {
    load();
  };

  const equity = equityOf(state);
  const monthlyNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state) / 12, 0);
  const terms = loanTerms(state);
  const monthlyInterest = (state.debt * (terms.rate / 100)) / 12;
  const ltv = ltvOf(state);
  const myRank =
    [...state.competitors.map((c) => c.equity), equity].sort((a, b) => b - a).indexOf(equity) + 1;

  const panelTabs = [
    { id: "portfolio", label: `Portfölj (${state.portfolio.length})` },
    { id: "market", label: "Marknad" },
    { id: "build", label: "Bygg" },
    { id: "finance", label: "Finans" },
    { id: "rivals", label: "Konk." },
    { id: "log", label: "Logg" },
  ];

  return (
    <div style={S.appLayout}>
      {/* Toolbar */}
      <Toolbar
        state={state}
        dispatch={dispatch}
        saved={saved}
        onSave={doSave}
        onLoad={doLoad}
      />

      {/* Main content row */}
      <div style={S.contentRow}>
        {/* Left: Map */}
        <div style={S.mapSection}>
          <MapPanel state={state} dispatch={dispatch} />
          {/* GameOver overlay */}
          {state.gameOver && (
            <div style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(30,14,18,0.85)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              zIndex: 10,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#ffd700", marginBottom: 12 }}>
                Spelet är slut
              </div>
              <div style={{ fontSize: 15, color: "#ddd", marginBottom: 20 }}>
                Eget kapital: {msek(equity)} efter {state.year} år
              </div>
              <button
                style={{ ...S.toolbarNextBtn, fontSize: 15, padding: "10px 24px" }}
                onClick={() => dispatch({ type: "RESET" })}
              >
                Spela igen
              </button>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={S.rightPanel}>
          {/* Tab bar */}
          <div style={S.panelTabBar}>
            {panelTabs.map((t) => (
              <button
                key={t.id}
                style={{ ...S.panelTab, ...(tab === t.id ? S.panelTabActive : {}) }}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={S.panelContent}>
            {tab === "portfolio" && <PortfolioTable state={state} dispatch={dispatch} />}
            {tab === "market" && <MarketTable state={state} dispatch={dispatch} />}
            {tab === "build" && <BuildPanel state={state} dispatch={dispatch} />}
            {tab === "finance" && (
              <>
                <FinancePanel state={state} dispatch={dispatch} equity={equity} ltv={ltv} terms={terms} />
                <div style={{ padding: "0 16px 16px" }}>
                  <EquityChart history={state.history} />
                </div>
              </>
            )}
            {tab === "rivals" && <RivalsPanel state={state} equity={equity} />}
            {tab === "log" && <LogPanel log={state.log} />}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        state={state}
        equity={equity}
        ltv={ltv}
        terms={terms}
        monthlyNOI={monthlyNOI}
        monthlyInterest={monthlyInterest}
        myRank={myRank}
      />
    </div>
  );
}
