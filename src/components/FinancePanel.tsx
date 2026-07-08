import { useState } from "react";
import { esgRatingOf } from "../engine/esg";
import { LENDERS, amortInfoOf, loanTerms } from "../engine/finance";
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
  const [drawAmt, setDrawAmt] = useState(500000);
  const [repayAmt, setRepayAmt] = useState(500000);
  const [divAmt, setDivAmt] = useState(1000000);
  const [bondAmt, setBondAmt] = useState(5000000);
  const [bondYears, setBondYears] = useState(5);

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
        {(() => {
          const esg = esgRatingOf(state);
          return (
            <>
              <Line
                l={`ESG-betyg (energiklasser)`}
                v={`${esg.letter}${esg.spreadDelta !== 0 ? ` (${esg.spreadDelta > 0 ? "+" : ""}${esg.spreadDelta} % ränta)` : ""}`}
                accent={esg.spreadDelta < 0 ? "#27660a" : esg.spreadDelta > 0 ? "#c0392b" : undefined}
              />
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {esg.spreadDelta < 0
                  ? "🌱 Grönt lån aktivt — hög energistandard belönas av bankerna."
                  : esg.spreadDelta > 0
                    ? "🏭 Lågt ESG-betyg ger räntepåslag. Energiuppgradera fastigheterna."
                    : "Nå snittbetyg B för grönt lån (−0,25 till −0,5 % ränta)."}
              </div>
            </>
          );
        })()}
        {state.reputation < 98 && (() => {
          const nextRep = Math.min(100, Math.round(state.reputation) + 10);
          const nextSpread = +(2.5 - (nextRep / 100) * 1.7).toFixed(2);
          const nextLtv = 0.6 + (nextRep / 100) * 0.2;
          const nextRate = +(state.interestRate + nextSpread).toFixed(2);
          return (
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, padding: "6px 8px", background: "#f2f5f8", borderRadius: 6 }}>
              Med +10 reputation → ränta {nextRate} % · LTV {pct(nextLtv)}
            </div>
          );
        })()}
        <h3 style={{ ...S.h3, marginTop: 18 }}>Skuldportfölj & amortering</h3>
        {(() => {
          const ai = amortInfoOf(state);
          const bondInterestMo = (state.bonds ?? []).reduce(
            (a, b) => a + Math.round((b.amount * b.rate) / 100 / 12), 0);
          const revInterestMo = state.revolving?.used
            ? Math.round((state.revolving.used * 0.015) / 12) : 0;
          const bankInterestMo = Math.round(annualInterest / 12);
          const totalDebtCostMo = bankInterestMo + bondInterestMo + revInterestMo + ai.monthly;
          // Skuldtrappan: bankens alla LTV-nivåer, med nuvarande läge markerat.
          const STEPS: { min: number; max: number; label: string; bad: boolean }[] = [
            { min: 0.85, max: 9, label: "Bankstraff 1,5 %/år + rep-tapp", bad: true },
            { min: 0.75, max: 0.85, label: "Räntepåslag 0,5 %/år", bad: true },
            { min: 0.7, max: 0.75, label: "Amorteringskrav 2 %/år", bad: false },
            { min: 0.5, max: 0.7, label: "Amorteringskrav 1 %/år", bad: false },
            { min: 0, max: 0.5, label: "Amorteringsfritt", bad: false },
          ];
          return (
            <>
              <div style={{ marginBottom: 8 }}>
                {STEPS.map((st) => {
                  const here = ai.ltv > st.min && ai.ltv <= st.max;
                  return (
                    <div key={st.min} style={{
                      display: "flex", justifyContent: "space-between", fontSize: 11.5,
                      padding: "3px 8px", borderRadius: 4, marginBottom: 1,
                      background: here ? (st.bad ? "#fbe9e4" : "#eef3e6") : "transparent",
                      fontWeight: here ? 800 : 400,
                      color: here ? (st.bad ? "#8a3a2a" : "#27660a") : "#888",
                    }}>
                      <span>{st.max > 1 ? `> ${st.min * 100} %` : st.min === 0 ? `< ${st.max * 100} %` : `${st.min * 100}–${st.max * 100} %`}{here ? ` ← du (${Math.round(ai.ltv * 100)} %)` : ""}</span>
                      <span>{st.label}</span>
                    </div>
                  );
                })}
              </div>
              <Line l="Amorteringskrav" v={ai.monthly > 0 ? `−${kr(ai.monthly)}/mån` : "0 kr (amorteringsfritt)"} accent={ai.monthly > 0 ? "#c0392b" : "#27660a"} />
              <Line l="Ränta bank + obligationer + kredit" v={`−${kr(bankInterestMo + bondInterestMo + revInterestMo)}/mån`} />
              <Line l="Skuldens månadskostnad" v={`−${kr(totalDebtCostMo)}/mån`} bold />
              {ai.amortToNextBreak != null && ai.amortToNextBreak > 0 && ai.nextBreakLtv != null && (
                <button
                  style={{ ...S.amortBtn, background: "#1a4a6b", marginTop: 6 }}
                  disabled={state.cash < ai.amortToNextBreak}
                  title={state.cash < ai.amortToNextBreak ? `Kassan räcker inte (${kr(ai.amortToNextBreak)} behövs)` : ""}
                  onClick={() => dispatch({ type: "AMORT", amount: ai.amortToNextBreak! })}
                >
                  Amortera till {Math.round(ai.nextBreakLtv * 100)} % LTV ({msek(ai.amortToNextBreak)})
                  {ai.nextBreakLtv === 0.5 ? " → amorteringsfritt" : " → 1 %/år"}
                </button>
              )}
            </>
          );
        })()}
        <div style={{ ...S.amortRow, marginTop: 10 }}>
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
          Amortera valfritt belopp
        </button>
      </div>

      <div style={S.financeCol}>
        <h3 style={S.h3}>Räntestrategi</h3>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            Nuvarande: <strong>{state.rateMode === "fixed" ? `Fast ${state.fixedRate?.toFixed(2)} %` : `Rörlig ${terms.rate.toFixed(2)} %`}</strong>
            {state.rateMode === "fixed" && state.fixedUntilAbs != null && (
              <span style={{ color: "#c0392b", marginLeft: 6 }}>
                ({Math.max(0, state.fixedUntilAbs - (state.year * 12 + state.month))} mån kvar)
              </span>
            )}
          </div>
          {state.rateMode !== "fixed" ? (
            <button
              style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 4 }}
              onClick={() => dispatch({ type: "SET_RATE_MODE", mode: "fixed", months: 36 })}
              disabled={state.debt === 0}
            >
              Lås ränta i 36 mån (avgift 0,5 % av skuld)
            </button>
          ) : (
            <button
              style={{ ...S.amortBtn, background: "#555" }}
              onClick={() => dispatch({ type: "SET_RATE_MODE", mode: "variable" })}
            >
              Byt till rörlig ränta
            </button>
          )}
        </div>

        <h3 style={{ ...S.h3, marginTop: 14 }}>Revolverande kredit</h3>
        {state.revolving ? (
          <>
            <Line l="Kreditgräns" v={kr(state.revolving.limit)} />
            <Line l="Utnyttjad" v={kr(state.revolving.used)} />
            <Line l="Tillgänglig" v={kr(state.revolving.limit - state.revolving.used)} accent="#27660a" />
            <div style={S.amortRow}>
              <input type="range" min="0" max={state.revolving.limit - state.revolving.used}
                step="100000" value={Math.min(drawAmt, state.revolving.limit - state.revolving.used)}
                onChange={(e) => setDrawAmt(+e.target.value)} style={{ flex: 1, accentColor: "#27660a" }} />
              <span style={{ minWidth: 90, textAlign: "right" }}>{msek(drawAmt)}</span>
            </div>
            <button style={{ ...S.amortBtn, background: "#27660a", marginBottom: 6 }}
              onClick={() => dispatch({ type: "DRAW_REVOLVING", amount: drawAmt })}>
              Utnyttja kredit
            </button>
            {state.revolving.used > 0 && (
              <>
                <div style={S.amortRow}>
                  <input type="range" min="0" max={Math.min(state.revolving.used, state.cash)}
                    step="100000" value={Math.min(repayAmt, state.revolving.used, state.cash)}
                    onChange={(e) => setRepayAmt(+e.target.value)} style={{ flex: 1, accentColor: BURGUNDY }} />
                  <span style={{ minWidth: 90, textAlign: "right" }}>{msek(repayAmt)}</span>
                </div>
                <button style={S.amortBtn} onClick={() => dispatch({ type: "REPAY_REVOLVING", amount: repayAmt })}>
                  Återbetala
                </button>
              </>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: "#888" }}>
            Revolverande kredit aktiveras automatiskt när du uppnår reputation 40.
          </div>
        )}

        <h3 style={{ ...S.h3, marginTop: 14 }}>Utdelning</h3>
        <Line l="Totalt utdelat" v={kr(state.dividendsPaid ?? 0)} />
        <div style={S.amortRow}>
          <input type="range" min="0" max={Math.max(0, state.cash - 500000)}
            step="100000" value={Math.min(divAmt, Math.max(0, state.cash - 500000))}
            onChange={(e) => setDivAmt(+e.target.value)} style={{ flex: 1, accentColor: C.gold }} />
          <span style={{ minWidth: 90, textAlign: "right" }}>{msek(divAmt)}</span>
        </div>
        <button
          style={{ ...S.amortBtn, background: "#3d54d8" }}
          onClick={() => dispatch({ type: "PAY_DIVIDEND", amount: divAmt })}
          disabled={state.cash < 600000}
        >
          Betala utdelning
        </button>
        <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Minst 500 000 kr i kassa behålls.</div>

        {/* Bonds */}
        <h3 style={{ ...S.h3, marginTop: 14 }}>Obligationsemission</h3>
        {state.reputation < 70 ? (
          <div style={{ fontSize: 12, color: "#888" }}>Kräver reputation ≥ 70 (nuvarande: {Math.round(state.reputation)}).</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
              Ge ut företagsobligationer för kapital till fast ränta.
              Estimerad ränta: {(state.interestRate + 1.2).toFixed(2)} %
            </div>
            <div style={S.amortRow}>
              <input type="range" min={1000000} max={50000000} step={1000000}
                value={bondAmt} onChange={(e) => setBondAmt(+e.target.value)}
                style={{ flex: 1, accentColor: "#1a4a6b" }} />
              <span style={{ minWidth: 90, textAlign: "right" }}>{msek(bondAmt)}</span>
            </div>
            <div style={S.amortRow}>
              <input type="range" min={3} max={10} step={1}
                value={bondYears} onChange={(e) => setBondYears(+e.target.value)}
                style={{ flex: 1, accentColor: "#1a4a6b" }} />
              <span style={{ minWidth: 90, textAlign: "right" }}>{bondYears} år</span>
            </div>
            <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 6 }}
              onClick={() => dispatch({ type: "ISSUE_BOND", amount: bondAmt, years: bondYears })}>
              Emittera obligation
            </button>
            {(state.bonds ?? []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Utestående obligationer:</div>
                {(state.bonds ?? []).map((b) => (
                  <div key={b.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #eee" }}>
                    <span>{msek(b.amount)} @ {b.rate.toFixed(2)} %</span>
                    <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", borderRadius: 3, padding: "1px 6px" }}
                      onClick={() => dispatch({ type: "REPAY_BOND", bondId: b.id })}>
                      Återbetala
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={S.financeCol}>
        <h3 style={S.h3}>Skatteoptimering</h3>
        {(() => {
          const netIncome = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0) / 12
            - (state.debt * ((state.rateMode === "fixed" && state.fixedRate != null ? state.fixedRate : loanTerms(state).rate) / 100)) / 12;
          const monthlyDep = state.portfolio.reduce((sum, p) => {
            if (p.status !== "klar") return sum;
            return sum + ((p.purchasePrice ?? p.askPrice) * 0.02) / 12;
          }, 0);
          const energyACount = state.portfolio.filter(p => p.energyClass === "A" && p.status === "klar").length;
          const taxRate = Math.max(0.10, 0.22 - (energyACount > 0 ? 0.03 : 0));
          const taxableIncome = Math.max(0, netIncome - monthlyDep);
          const monthlyTax = Math.round(taxableIncome * taxRate);
          return (
            <>
              <Line l="Beräknad skattesats" v={`${Math.round(taxRate * 100)} %${energyACount > 0 ? " (−3 % via klass A)" : ""}`} />
              <Line l="Avdrag (avskrivning/mån)" v={kr(Math.round(monthlyDep))} />
              <Line l="Skattebar inkomst/mån" v={kr(Math.max(0, Math.round(taxableIncome)))} />
              <Line l="Beräknad skatt/mån" v={kr(monthlyTax)} />
              <Line l="Totalt betald skatt" v={kr(state.totalTaxPaid ?? 0)} />
              {energyACount === 0 && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 6, padding: "6px 10px", background: "#f0f4f8", borderRadius: 4 }}>
                  💡 Uppgradera fastigheter till energiklass A för att sänka skattesatsen med 3 procentenheter.
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div style={S.financeCol}>
        <h3 style={S.h3}>Välj långivare</h3>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
          Byt bank för att påverka ränta och belåningsgrad. Aktiv: <strong>{LENDERS.find(l => l.id === state.selectedLender)?.name ?? "Standard (ingen bank vald)"}</strong>
        </div>
        {(() => {
          const baseLtv = 0.55 + (state.reputation / 100) * 0.19;
          const baseSpread = Math.max(0.3, 2.5 - (state.reputation / 100) * 1.7);
          return LENDERS.map((lender) => {
            const locked = state.reputation < lender.minReputation;
            const active = state.selectedLender === lender.id;
            const actualRate = +(state.interestRate + baseSpread + lender.rateBonus).toFixed(2);
            const actualLtv = Math.max(0.5, Math.min(0.85, baseLtv + lender.ltvBonus));
            return (
              <div
                key={lender.id}
                onClick={() => !locked && dispatch({ type: "SELECT_LENDER", lenderId: lender.id })}
                style={{
                  marginBottom: 8,
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: `2px solid ${active ? BURGUNDY : locked ? "#ddd" : C.brassDim}`,
                  background: active ? "#e9efff" : locked ? "#f5f5f5" : "#fff",
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
                    Ränta: {actualRate.toFixed(2)} %
                  </span>
                  <span style={{ color: lender.ltvBonus >= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                    Max LTV: {(actualLtv * 100).toFixed(0)} %
                  </span>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
