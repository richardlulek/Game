import { useState } from "react";
import { equityOf, loanTerms, ltvOf } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { propNOI } from "../engine/property";
import { useGameStore } from "../store/gameStore";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { BuildPanel } from "./BuildPanel";
import { EquityChart } from "./EquityChart";
import { FinancePanel } from "./FinancePanel";
import { ListingCard } from "./ListingCard";
import { LogPanel } from "./LogPanel";
import { MapPanel } from "./MapPanel";
import { PortfolioCard } from "./PortfolioCard";
import { RivalsPanel } from "./RivalsPanel";
import { Stat } from "./Stat";
import { Tabs } from "./Tabs";

export default function FastighetsImperium() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const save = useGameStore((s) => s.save);
  const load = useGameStore((s) => s.load);

  const [tab, setTab] = useState("portfolio");
  const [saved, setSaved] = useState(false);

  // Persistens via localStorage (med versionshantering, se store/persistence.ts).
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

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div>
          <h1 style={S.title}>
            FASTIGHETS<span style={{ color: BURGUNDY }}>IMPERIUM</span>
          </h1>
          <div style={S.subtitle}>Förvärva · Bygg · Förvalta · Dominera</div>
        </div>
        <div style={S.dateBox}>
          <div style={S.dateLabel}>MÅNAD</div>
          <div style={S.dateValue}>
            {state.month}/{state.year}
          </div>
          <button
            style={S.nextBtn}
            disabled={state.gameOver}
            onClick={() => dispatch({ type: "NEXT_MONTH" })}
          >
            ► Nästa månad
          </button>
          <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button style={S.miniBtn} onClick={doSave}>
              {saved ? "✓ Sparat" : "Spara"}
            </button>
            <button style={S.miniBtn} onClick={doLoad}>
              Ladda
            </button>
          </div>
        </div>
      </header>

      <div style={S.statRow}>
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
        <Stat label="Din låneränta" value={terms.rate + " %"} sub={`påslag +${terms.spread}`} />
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

      <EquityChart history={state.history} />

      {state.gameOver && (
        <div style={S.gameOver}>
          Spelet är slut. Eget kapital: {msek(equity)} efter {state.year} år.
          <button style={S.resetBtn} onClick={() => dispatch({ type: "RESET" })}>
            Spela igen
          </button>
        </div>
      )}

      <Tabs
        tab={tab}
        setTab={setTab}
        items={[
          { id: "portfolio", label: `Portfölj (${state.portfolio.length})` },
          { id: "map", label: "Karta" },
          { id: "market", label: "Marknad" },
          { id: "build", label: "Nyproduktion" },
          { id: "finance", label: "Finans" },
          { id: "rivals", label: "Konkurrenter" },
          { id: "log", label: "Händelser" },
        ]}
      />

      {tab === "portfolio" && (
        <div style={S.grid}>
          {state.portfolio.length === 0 && (
            <div style={S.empty}>
              Inga fastigheter ännu. Gå till <strong>Marknad</strong> eller{" "}
              <strong>Nyproduktion</strong>.
            </div>
          )}
          {state.portfolio.map((p) => (
            <PortfolioCard key={p.id} p={p} state={state} dispatch={dispatch} />
          ))}
        </div>
      )}

      {tab === "map" && <MapPanel state={state} dispatch={dispatch} />}

      {tab === "market" && (
        <div>
          <div style={S.marketBar}>
            <span>Objekt till salu</span>
            <button style={S.smallBtn} onClick={() => dispatch({ type: "REFRESH_LISTINGS" })}>
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

      {tab === "build" && <BuildPanel state={state} dispatch={dispatch} />}
      {tab === "finance" && (
        <FinancePanel state={state} dispatch={dispatch} equity={equity} ltv={ltv} terms={terms} />
      )}
      {tab === "rivals" && <RivalsPanel state={state} equity={equity} />}

      {tab === "log" && <LogPanel log={state.log} />}

      <footer style={S.footer}>
        Bygg upp reputation för bättre lånevillkor · håll lokaler uthyrda · slå konkurrenterna i
        eget kapital.
      </footer>
    </div>
  );
}
