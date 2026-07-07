import { useState } from "react";
import { monthlyInterestOf, totalDebtOf } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { propMarketValue, propNOI } from "../engine/property";
import type { GameAction, GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY } from "../styles/tokens";
import { Line } from "./Line";

interface FinancePanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  equity: number;
  ltv: number;
  terms: LoanTerms;
}

export function FinancePanel({ state, dispatch, equity, ltv, terms }: FinancePanelProps) {
  const [amt, setAmt] = useState(1000000);
  const totalValue = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
  const totalNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0);
  const annualInterest = monthlyInterestOf(state) * 12;
  const bindAmt = Math.min(amt, state.debt);
  return (
    <div style={S.financeWrap}>
      <div style={S.financeCol}>
        <h3 style={S.h3}>Balansräkning</h3>
        <Line l="Kassa" v={kr(state.cash)} />
        <Line l="Fastighetsvärde" v={kr(totalValue)} />
        <Line l="Totala tillgångar" v={kr(state.cash + totalValue)} bold />
        <Line l="Rörlig skuld" v={"−" + kr(state.debt)} />
        {state.fixedLoans.map((l) => (
          <Line
            key={l.id}
            l={`Bundet lån ${l.rate} % (${l.monthsLeft} mån kvar)`}
            v={"−" + kr(l.amount)}
          />
        ))}
        <Line l="Total skuld" v={"−" + kr(totalDebtOf(state))} bold />
        <Line l="Eget kapital" v={kr(equity)} bold accent={BURGUNDY} />
        <Line l="Belåningsgrad (LTV)" v={pct(ltv)} />
      </div>
      <div style={S.financeCol}>
        <h3 style={S.h3}>Resultat (årstakt)</h3>
        <Line l="Driftnetto" v={kr(totalNOI)} accent="#27660a" />
        <Line l="Räntekostnad" v={"−" + kr(annualInterest)} accent="#c0392b" />
        <Line l="Kassaflöde" v={kr(totalNOI - annualInterest)} bold />
        <h3 style={{ ...S.h3, marginTop: 18 }}>
          Lånevillkor (reputation {Math.round(state.reputation)})
        </h3>
        <Line l="Räntepåslag" v={"+" + terms.spread + " %"} />
        <Line l="Maximal belåningsgrad" v={pct(terms.maxLtv)} />
        <h3 style={{ ...S.h3, marginTop: 18 }}>Amortera</h3>
        <div style={S.amortRow}>
          <input
            type="range"
            min="0"
            max={Math.max(0, Math.min(state.cash, state.debt))}
            step="100000"
            value={Math.min(amt, state.cash, state.debt)}
            onChange={(e) => setAmt(+e.target.value)}
            style={{ flex: 1, accentColor: BURGUNDY }}
          />
          <span style={{ minWidth: 90, textAlign: "right" }}>
            {msek(Math.min(amt, state.cash, state.debt))}
          </span>
        </div>
        <button style={S.amortBtn} onClick={() => dispatch({ type: "AMORT", amount: amt })}>
          Amortera
        </button>
        <h3 style={{ ...S.h3, marginTop: 18 }}>Bind ränta</h3>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
          Skydda dig mot räntehöjningar: bind en del av den rörliga skulden (beloppet ovan) mot ett
          litet påslag.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={{ ...S.upgBtn, flex: 1 }}
            disabled={bindAmt < 100_000}
            onClick={() => dispatch({ type: "BIND_LOAN", amount: bindAmt, months: 36 })}
          >
            Bind {msek(bindAmt)} · 3 år (+0,3 %)
          </button>
          <button
            style={{ ...S.upgBtn, flex: 1 }}
            disabled={bindAmt < 100_000}
            onClick={() => dispatch({ type: "BIND_LOAN", amount: bindAmt, months: 60 })}
          >
            5 år (+0,5 %)
          </button>
        </div>
      </div>
    </div>
  );
}
