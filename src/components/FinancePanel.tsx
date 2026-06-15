import { useState } from "react";
import { LENDERS } from "../engine/finance";
import { kr, msek, pct } from "../engine/format";
import { propMarketValue, propNOI } from "../engine/property";
import type { GameAction, GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY, C, FONTS } from "../styles/tokens";
import { Line } from "./Line";

interface FinancePanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  equity: number;
  ltv: number;
  terms: LoanTerms;
}

export function FinancePanel({ state, dispatch, equity, ltv, terms }: FinancePanelProps) {
  const [amortAmt, setAmortAmt] = useState(1000000);
  const [refiAmt, setRefiAmt] = useState(1000000);

  const totalValue = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
  const totalNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0);
  const annualInterest = state.debt * (terms.rate / 100);
  const maxRefi = Math.max(0, Math.floor(totalValue * terms.maxLtv) - state.debt);

  return (
    <div style={S.financeWrap}>
      <div style={S.financeCol}>
        <h3 style={S.h3}>Balansräkning</h3>
        <Line l="Kassa" v={kr(state.cash)} />
        <Line l="Fastighetsvärde" v={kr(totalValue)} />
        <Line l="Totala tillgångar" v={kr(state.cash + totalValue)} bold />
        <Line l="Skulder" v={"−" + kr(state.debt)} />
        <Line l="Eget kapital" v={kr(equity)} bold accent={BURGUNDY} />
        <Line l="Belåningsgrad (LTV)" v={pct(ltv)} />

        <h3 style={{ ...S.h3, marginTop: 18 }}>Belåna portföljen</h3>
        <Line
          l="Låneutrymme kvar"
          v={kr(maxRefi)}
          accent={maxRefi > 0 ? "#27660a" : "#999"}
        />
        {maxRefi > 0 ? (
          <>
            <div style={S.amortRow}>
              <input
                type="range"
                min="0"
                max={maxRefi}
                step="100000"
                value={Math.min(refiAmt, maxRefi)}
                onChange={(e) => setRefiAmt(+e.target.value)}
                style={{ flex: 1, accentColor: "#27660a" }}
              />
              <span style={{ minWidth: 90, textAlign: "right" }}>
                {msek(Math.min(refiAmt, maxRefi))}
              </span>
            </div>
            <button
              style={{ ...S.amortBtn, background: "#27660a" }}
              onClick={() => dispatch({ type: "REFINANCE", amount: refiAmt })}
            >
              Belåna mer
            </button>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
              Extra räntekostnad: {kr(Math.min(refiAmt, maxRefi) * (terms.rate / 100))}/år · reputation −1
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
            Portföljen är maximalt belånad till {pct(terms.maxLtv)} LTV.
          </div>
        )}
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
        {state.reputation < 98 && (() => {
          const nextRep = Math.min(100, Math.round(state.reputation) + 10);
          const nextSpread = +(2.5 - (nextRep / 100) * 1.7).toFixed(2);
          const nextLtv = 0.6 + (nextRep / 100) * 0.2;
          const nextRate = +(state.interestRate + nextSpread).toFixed(2);
          return (
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, padding: "6px 8px", background: "#f8f5f2", borderRadius: 6 }}>
              Med +10 reputation → ränta {nextRate} % · LTV {pct(nextLtv)}
            </div>
          );
        })()}
        <h3 style={{ ...S.h3, marginTop: 18 }}>Amortera</h3>
        <div style={S.amortRow}>
          <input
            type="range"
            min="0"
            max={Math.max(0, Math.min(state.cash, state.debt))}
            step="100000"
            value={Math.min(amortAmt, state.cash, state.debt)}
            onChange={(e) => setAmortAmt(+e.target.value)}
            style={{ flex: 1, accentColor: BURGUNDY }}
          />
          <span style={{ minWidth: 90, textAlign: "right" }}>
            {msek(Math.min(amortAmt, state.cash, state.debt))}
          </span>
        </div>
        <button
          style={S.amortBtn}
          onClick={() => dispatch({ type: "AMORT", amount: amortAmt })}
        >
          Amortera
        </button>
      </div>

      <div style={S.financeCol}>
        <h3 style={S.h3}>Välj långivare</h3>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          Byt bank för att påverka ränta och belåningsgrad. Aktiv: <strong>{LENDERS.find(l => l.id === state.selectedLender)?.name ?? "Standard (ingen bank vald)"}</strong>
        </div>
        {LENDERS.map((lender) => {
          const locked = state.reputation < lender.minReputation;
          const active = state.selectedLender === lender.id;
          return (
            <div
              key={lender.id}
              onClick={() => !locked && dispatch({ type: "SELECT_LENDER", lenderId: lender.id })}
              style={{
                marginBottom: 8,
                padding: "10px 14px",
                borderRadius: 6,
                border: `2px solid ${active ? BURGUNDY : locked ? "#ddd" : C.brassDim}`,
                background: active ? "#fdf6e3" : locked ? "#f5f5f5" : "#fff",
                cursor: locked ? "default" : "pointer",
                opacity: locked ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: active ? BURGUNDY : "#333" }}>
                  {lender.name}
                </span>
                {active && <span style={{ fontSize: 11, fontWeight: 700, color: BURGUNDY }}>AKTIV</span>}
                {locked && <span style={{ fontSize: 11, color: "#bbb" }}>Kräver rep. {lender.minReputation}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "#888", marginTop: 3 }}>{lender.desc}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12 }}>
                <span style={{ color: lender.rateBonus <= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                  Ränta {lender.rateBonus > 0 ? "+" : ""}{lender.rateBonus.toFixed(1)} %
                </span>
                <span style={{ color: lender.ltvBonus >= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                  LTV {lender.ltvBonus > 0 ? "+" : ""}{(lender.ltvBonus * 100).toFixed(0)} pp
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
