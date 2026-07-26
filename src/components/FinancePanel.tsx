/* Finanshubben – all finansiering samlad i ETT fönster med interna
   flikar (samma mönster som Bolagshubben): Översikt, Lån, Kapital-
   marknad, Institut och Skatt. Varje del kan växa vidare utan att
   överblicken går förlorad. */

import { useState } from "react";
import { esgRatingOf } from "../engine/esg";
import {
  COVENANT_ICR_FLOOR,
  COVENANT_ICR_SIGNUP,
  COVENANT_RATE_DELTA,
  CONVERTIBLE_MAX_OF_EQUITY,
  CONVERTIBLE_RATE_DISCOUNT,
  CONVERTIBLE_TRIGGER,
  CP_MAX_OF_EQUITY,
  CP_SPREAD,
  CP_TERM_MONTHS,
  HOLDING_TAX_DELTA,
  INTEREST_CAP_OF_NOI,
  IR_COST_MIN,
  IR_COST_OF_EQUITY,
  LENDERS,
  RATE_LOCK_TERMS,
  TAX_AUDIT_CHANCE,
  TAX_DEP_AGGRESSIVE,
  TAX_DEP_NORMAL,
  TAX_RESERVE_MAX_COUNT,
  TAX_RESERVE_MAX_PCT,
  amortInfoOf,
  loanTerms,
} from "../engine/finance";
import { resultatrakning } from "../engine/bokslut";
import { curveInverted, longRate } from "../engine/centralBank";
import { GREEN_BOND_DISCOUNT, IR_RATING_BONUS, bondRateFor, creditRatingOf } from "../engine/rating";
import {
  bankCapitalOf,
  bankMonthlyNet,
  bankPurchasePrice,
  bankRequiredCapital,
  bankValue,
  depositCampaignCost,
  insurerMonthlyNet,
  insurerPurchasePrice,
  insurerValue,
  rentGuaranteeClaimRatio,
} from "../engine/finInstitutions";
import { kr, msek, pct } from "../engine/format";
import { propMarketValue, propNOI } from "../engine/property";
import {
  RESTRUCTURING_EXTRA_AMORT,
  RESTRUCTURING_LTV_PENALTY,
  restructuringMonthsLeft,
  underRestructuringTerms,
} from "../engine/receivership";
import { bankStanding, standingLabel } from "../engine/standing";
import type { GameAction, GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";
import { BURGUNDY, C, FONTS } from "../styles/tokens";
import { Line } from "./Line";

const FIN_TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "lending", label: "Lending", icon: "🏦" },
  { id: "capital", label: "Capital markets", icon: "📜" },
  { id: "institut", label: "Institutions", icon: "🏛️" },
  { id: "tax", label: "Tax", icon: "🧾" },
] as const;

type FinTab = (typeof FIN_TABS)[number]["id"];

interface FinancePanelProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  equity: number;
  ltv: number;
  terms: LoanTerms;
}

export function FinancePanel({ state, dispatch, equity, ltv, terms }: FinancePanelProps) {
  const rating = creditRatingOf(state);
  const [tab, setTab] = useState<FinTab>("overview");
  const [amortAmt, setAmortAmt] = useState(1000000);
  const [refiAmt, setRefiAmt] = useState(1000000);
  const [drawAmt, setDrawAmt] = useState(500000);
  const [repayAmt, setRepayAmt] = useState(500000);
  const [bondAmt, setBondAmt] = useState(5000000);
  const [bondYears, setBondYears] = useState(5);
  const [cpAmt, setCpAmt] = useState(5000000);
  const [capAmt, setCapAmt] = useState(10000000);
  const [reserveAmt, setReserveAmt] = useState(2000000);

  const totalValue = state.portfolio.reduce((a, p) => a + propMarketValue(p, state), 0);
  const totalNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0);
  const annualInterest = state.debt * (terms.rate / 100);
  const maxRefi = Math.max(0, Math.floor(totalValue * terms.maxLtv) - state.debt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 2, borderBottom: `2px solid ${C.brass}44`, flexWrap: "wrap" }}>
        {FIN_TABS.map((t) => {
          const sel = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "7px 14px", background: "none", border: "none",
                borderBottom: sel ? `3px solid ${C.brass}` : "3px solid transparent",
                marginBottom: -2,
                color: sel ? C.brassBright : C.creamSoft,
                fontFamily: FONTS.heading, fontWeight: sel ? 700 : 500,
                fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Översikt: balansräkning + intjäning + lånevillkor ───────── */}
      {tab === "overview" && (
        <div style={S.financeWrap}>
          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Balance sheet</h3>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
              padding: "8px 10px", marginBottom: 8, borderRadius: 6,
              background: rating.score >= 60 ? "#eef8f2" : rating.score >= 36 ? "#fdf6e3" : "#fdecea",
              border: `1px solid ${rating.score >= 60 ? "#22a06b" : rating.score >= 36 ? "#c9a13b" : "#c0392b"}`,
            }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                Credit rating <strong style={{ fontSize: 15 }}>{rating.rating}</strong>
                <span style={{ color: "#888" }}> · {rating.drivers.join(" · ")}</span>
              </span>
              <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", flexShrink: 0 }}>spread {rating.spreadDelta >= 0 ? "+" : ""}{rating.spreadDelta.toFixed(1)}pp</span>
            </div>
            <Line l="Cash" v={kr(state.cash)} />
            <Line l="Property value" v={kr(totalValue)} />
            <Line l="Total assets" v={kr(state.cash + totalValue)} bold />
            <Line l="Liabilities" v={"−" + kr(state.debt)} />
            <Line l="Equity" v={kr(equity)} bold accent={BURGUNDY} />
            <Line l="Loan-to-value (LTV)" v={pct(ltv)} />
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Income (annualized)</h3>
            <Line l="Net operating income" v={kr(totalNOI)} accent={totalNOI >= 0 ? "#27660a" : "#c0392b"} />
            <Line l="Interest cost" v={"−" + kr(annualInterest)} accent="#c0392b" />
            <Line l="Cash flow" v={kr(totalNOI - annualInterest)} bold />
            <h3 style={{ ...S.h3OnLight, marginTop: 18 }}>Macro (the central bank)</h3>
            {(() => {
              const cb = state.centralBank;
              const inf = cb?.inflation ?? 2;
              const toDecision = (3 - ((state.year * 12 + state.month) % 3)) % 3 || 3;
              return (
                <>
                  <Line l="Policy rate" v={`${state.interestRate.toFixed(2)}%`} />
                  <Line l="Inflation (target 2.0%)" v={`${inf.toFixed(1)}%`}
                    accent={inf > 3.5 ? "#c0392b" : inf < 0.5 ? "#c0392b" : inf > 2.8 ? "#c9a13b" : "#27660a"} />
                  <Line l="10-yr market rate (bonds)" v={`${longRate(state).toFixed(2)}%`} />
                  {curveInverted(state) && (
                    <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 700, marginBottom: 4 }}>
                      📉 Inverted yield curve — markets are pricing in a downturn. Long bond
                      funding is now cheaper than short paper.
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Next rate decision in {toDecision} mo. The bank follows a Taylor rule —
                    hot markets, construction costs and population inflows push inflation,
                    and the rate follows.
                  </div>
                  {(state.refiSpreadAdj ?? 0) !== 0 && (
                    <Line l="Refinancing premium" v={`${(state.refiSpreadAdj ?? 0) >= 0 ? "+" : ""}${(state.refiSpreadAdj ?? 0).toFixed(1)}pp`}
                      accent={(state.refiSpreadAdj ?? 0) > 0 ? "#c0392b" : "#27660a"} />
                  )}
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 18 }}>
              Loan terms (reputation {Math.round(state.reputation)})
            </h3>
            <Line l="Interest spread" v={"+" + terms.spread + "%"} />
            <Line l="Maximum loan-to-value" v={pct(terms.maxLtv)} />
            {(() => {
              const bs = bankStanding(state);
              const sl = standingLabel(bs);
              return (
                <Line
                  l="Bank relationship"
                  v={`${sl.label}${bs !== 0 ? ` (${bs > 0 ? "+" : ""}${Math.round(bs)})` : ""}`}
                  accent={bs >= 25 ? "#27660a" : bs <= -25 ? "#c0392b" : undefined}
                />
              );
            })()}
            {underRestructuringTerms(state) && (
              <>
                <Line
                  l="⚖️ Restructuring covenants"
                  v={`${restructuringMonthsLeft(state)} mo left`}
                  accent="#c0392b"
                />
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  After the receivership the bank demands +{Math.round(RESTRUCTURING_EXTRA_AMORT * 100)}%/yr
                  amortization on existing debt and caps new lending (max LTV −{Math.round(RESTRUCTURING_LTV_PENALTY * 100)}pp).
                </div>
              </>
            )}
            {(() => {
              const esg = esgRatingOf(state);
              return (
                <>
                  <Line
                    l={`ESG rating (energy classes)`}
                    v={`${esg.letter}${esg.spreadDelta !== 0 ? ` (${esg.spreadDelta > 0 ? "+" : ""}${esg.spreadDelta}% rate)` : ""}`}
                    accent={esg.spreadDelta < 0 ? "#27660a" : esg.spreadDelta > 0 ? "#c0392b" : undefined}
                  />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {esg.spreadDelta < 0
                      ? "🌱 Green loan active — high energy standard is rewarded by the banks."
                      : esg.spreadDelta > 0
                        ? "🏭 Low ESG rating adds an interest premium. Upgrade the properties’ energy."
                        : "Reach an average B rating for a green loan (−0.25 to −0.5% rate)."}
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
                  With +10 reputation → rate {nextRate}% · LTV {pct(nextLtv)}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Lån: belåning, skuldportfölj, ränta, kredit, långivare ──── */}
      {tab === "lending" && (
        <div style={S.financeWrap}>
          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Leverage the portfolio</h3>
            <Line
              l="Borrowing capacity left"
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
                  Borrow more
                </button>
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                  Extra interest cost: {kr(Math.min(refiAmt, maxRefi) * (terms.rate / 100))}/yr · reputation −1
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
                The portfolio is maxed out at {pct(terms.maxLtv)} LTV.
              </div>
            )}

            <h3 style={{ ...S.h3OnLight, marginTop: 18 }}>Debt portfolio & amortization</h3>
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
                { min: 0.85, max: 9, label: "Bank penalty 1.5%/yr + rep loss", bad: true },
                { min: 0.75, max: 0.85, label: "Interest premium 0.5%/yr", bad: true },
                { min: 0.7, max: 0.75, label: "Amortization requirement 2%/yr", bad: false },
                { min: 0.5, max: 0.7, label: "Amortization requirement 1%/yr", bad: false },
                { min: 0, max: 0.5, label: "No amortization", bad: false },
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
                          <span>{st.max > 1 ? `> ${st.min * 100}%` : st.min === 0 ? `< ${st.max * 100}%` : `${st.min * 100}–${st.max * 100}%`}{here ? ` ← you (${Math.round(ai.ltv * 100)}%)` : ""}</span>
                          <span>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Line l="Amortization requirement" v={ai.monthly > 0 ? `−${kr(ai.monthly)}/mo` : "$0 (no amortization)"} accent={ai.monthly > 0 ? "#c0392b" : "#27660a"} />
                  <Line l="Interest bank + bonds + credit" v={`−${kr(bankInterestMo + bondInterestMo + revInterestMo)}/mo`} />
                  <Line l="Debt monthly cost" v={`−${kr(totalDebtCostMo)}/mo`} bold />
                  {ai.amortToNextBreak != null && ai.amortToNextBreak > 0 && ai.nextBreakLtv != null && (
                    <button
                      style={{ ...S.amortBtn, background: "#1a4a6b", marginTop: 6 }}
                      disabled={state.cash < ai.amortToNextBreak}
                      title={state.cash < ai.amortToNextBreak ? `Insufficient cash (${kr(ai.amortToNextBreak)} needed)` : ""}
                      onClick={() => dispatch({ type: "AMORT", amount: ai.amortToNextBreak! })}
                    >
                      Amortize to {Math.round(ai.nextBreakLtv * 100)}% LTV ({msek(ai.amortToNextBreak)})
                      {ai.nextBreakLtv === 0.5 ? " → no amortization" : " → 1%/yr"}
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
              Amortize custom amount
            </button>
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Loan maturity</h3>
            {state.debt > 0 ? (() => {
              const nowAbs = state.year * 12 + state.month;
              const tranches = state.debtTranches ?? [];
              const fee = Math.max(100_000, Math.round(state.debt * 0.004));
              const splitFee = Math.max(150_000, Math.round(state.debt * 0.003));
              if (tranches.length > 0) {
                return (
                  <>
                    {tranches.map((t, i) => (
                      <Line key={i} l={`Tranche ${i + 1} (~${Math.round(100 / tranches.length)}% of debt)`}
                        v={`${Math.max(0, t - nowAbs)} mo`}
                        accent={t - nowAbs <= 12 ? "#c0392b" : undefined} />
                    ))}
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
                      Staggered maturities: each refinancing renegotiates only a third of the
                      rate risk — one bad market day can no longer re-price the whole debt.
                    </div>
                  </>
                );
              }
              const toMature = state.debtMatureAbs != null ? Math.max(0, state.debtMatureAbs - nowAbs) : null;
              return (
                <>
                  <Line l="Refinancing due" v={toMature != null ? `${toMature} mo` : "not set"} accent={toMature != null && toMature <= 12 ? "#c0392b" : undefined} />
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    At maturity the rate is re-set by the market — maturing in a bust or recession is expensive.
                    Extend early to push the risk past the cycle, or tranche the debt to spread it.
                  </div>
                  <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 6 }}
                    disabled={state.cash < fee}
                    onClick={() => dispatch({ type: "EXTEND_MATURITY" })}>
                    Extend maturity 60 mo (fee {msek(fee)})
                  </button>
                  <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 10 }}
                    disabled={state.cash < splitFee}
                    onClick={() => dispatch({ type: "SPLIT_MATURITIES" })}>
                    Split into 3 tranches +24/+48/+72 mo (fee {msek(splitFee)})
                  </button>
                </>
              );
            })() : (
              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>No bank debt.</div>
            )}

            <h3 style={{ ...S.h3OnLight, marginTop: 4 }}>Covenant loan</h3>
            {(() => {
              const annualNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0);
              const icr = annualInterest > 0 ? annualNOI / annualInterest : 99;
              if (state.loanCovenant) {
                const breach = state.loanCovenant.breachMonths;
                return (
                  <>
                    <Line l="Rate relief" v={`−${COVENANT_RATE_DELTA}pp`} accent="#27660a" />
                    <Line l="Interest coverage" v={`${icr >= 99 ? "∞" : icr.toFixed(2)}× (floor ${COVENANT_ICR_FLOOR}×)`}
                      accent={icr < COVENANT_ICR_FLOOR ? "#c0392b" : "#27660a"} />
                    {breach > 0 && (
                      <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 4 }}>
                        ⚠️ {breach}/3 weak months — at 3 the bank tears it up (1% fee, rep −3).
                      </div>
                    )}
                    <button style={{ ...S.amortBtn, background: "#555", marginBottom: 10 }}
                      onClick={() => dispatch({ type: "SET_LOAN_COVENANT", on: false })}>
                      Cancel covenant loan
                    </button>
                  </>
                );
              }
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    −{COVENANT_RATE_DELTA}pp rate against keeping interest coverage ≥ {COVENANT_ICR_FLOOR}×.
                    Requires ICR ≥ {COVENANT_ICR_SIGNUP}× to sign (now {icr >= 99 ? "∞" : icr.toFixed(2)}×).
                  </div>
                  <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 10 }}
                    disabled={state.debt <= 0 || icr < COVENANT_ICR_SIGNUP}
                    onClick={() => dispatch({ type: "SET_LOAN_COVENANT", on: true })}>
                    Sign covenant loan
                  </button>
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 4 }}>Rate strategy</h3>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                Current: <strong>{state.rateMode === "fixed" ? `Fixed ${state.fixedRate?.toFixed(2)}%` : `Variable ${terms.rate.toFixed(2)}%`}</strong>
                {state.rateMode === "fixed" && state.fixedUntilAbs != null && (
                  <span style={{ color: "#c0392b", marginLeft: 6 }}>
                    ({Math.max(0, state.fixedUntilAbs - (state.year * 12 + state.month))} mo left)
                  </span>
                )}
              </div>
              {state.rateMode !== "fixed" ? (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Lock the rate — longer terms carry a premium (the bank prices the rate risk):
                  </div>
                  {([12, 36, 60] as const).map((mo) => {
                    const lt = RATE_LOCK_TERMS[mo];
                    return (
                      <button
                        key={mo}
                        style={{ ...S.amortBtn, background: "#1a4a6b", marginTop: 6 }}
                        onClick={() => dispatch({ type: "SET_RATE_MODE", mode: "fixed", months: mo })}
                        disabled={state.debt === 0}
                      >
                        {mo} mo @ {(terms.rate + lt.premium).toFixed(2)}%
                        {lt.premium > 0 ? ` (+${lt.premium.toFixed(2)}pp)` : " (no premium)"} · fee {(lt.feePct * 100).toFixed(1)}%
                      </button>
                    );
                  })}
                </>
              ) : (
                <button
                  style={{ ...S.amortBtn, background: "#555" }}
                  onClick={() => dispatch({ type: "SET_RATE_MODE", mode: "variable" })}
                >
                  Switch to variable rate
                </button>
              )}
            </div>

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Revolving credit</h3>
            {state.revolving ? (
              <>
                <Line l="Credit limit" v={kr(state.revolving.limit)} />
                <Line l="Drawn" v={kr(state.revolving.used)} />
                <Line l="Available" v={kr(state.revolving.limit - state.revolving.used)} accent="#27660a" />
                <div style={{ fontSize: 11, opacity: 0.75, margin: "2px 0 6px" }}>
                  The line is 5% of portfolio value plus a quarter of your unused mortgage
                  headroom — borrow less against the buildings and the bank leaves you a
                  bigger cushion for a bad month.
                </div>
                <div style={S.amortRow}>
                  <input type="range" min="0" max={state.revolving.limit - state.revolving.used}
                    step="100000" value={Math.min(drawAmt, state.revolving.limit - state.revolving.used)}
                    onChange={(e) => setDrawAmt(+e.target.value)} style={{ flex: 1, accentColor: "#27660a" }} />
                  <span style={{ minWidth: 90, textAlign: "right" }}>{msek(drawAmt)}</span>
                </div>
                <button style={{ ...S.amortBtn, background: "#27660a", marginBottom: 6 }}
                  onClick={() => dispatch({ type: "DRAW_REVOLVING", amount: drawAmt })}>
                  Draw credit
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
                      Repay
                    </button>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#888" }}>
                Revolving credit activates automatically when you reach reputation 40.
              </div>
            )}
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Choose lender</h3>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
              Switch bank to affect rate and loan-to-value. Active: <strong>{LENDERS.find(l => l.id === state.selectedLender)?.name ?? "Standard (no bank selected)"}</strong>
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
                      {active && <span style={{ fontSize: 11, fontWeight: 700, color: BURGUNDY }}>ACTIVE</span>}
                      {locked && <span style={{ fontSize: 11, color: "#bbb" }}>Requires rep. {lender.minReputation}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#888", marginTop: 3 }}>{lender.desc}</div>
                    <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12 }}>
                      <span style={{ color: lender.rateBonus <= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                        Rate: {actualRate.toFixed(2)}%
                      </span>
                      <span style={{ color: lender.ltvBonus >= 0 ? "#27660a" : "#c0392b", fontWeight: 700 }}>
                        Max LTV: {(actualLtv * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── Kapitalmarknad: obligationer + utdelning ────────────────── */}
      {tab === "capital" && (
        <div style={S.financeWrap}>
          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Bond program</h3>
            {rating.bondCap <= 0 ? (
              <div style={{ fontSize: 12, color: "#888" }}>Rating {rating.rating} closes the bond market — strengthen the balance sheet.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                  Program cap at rating {rating.rating}: {msek(rating.bondCap)} ·
                  outstanding {msek((state.bonds ?? []).reduce((a, b) => a + b.amount, 0))} ·
                  coupon {bondRateFor(state, rating.rating).toFixed(2)}%
                </div>
                <div style={S.amortRow}>
                  <input type="range" min={1000000} max={Math.max(1_000_000, rating.bondCap)} step={1000000}
                    value={bondAmt} onChange={(e) => setBondAmt(+e.target.value)}
                    style={{ flex: 1, accentColor: "#1a4a6b" }} />
                  <span style={{ minWidth: 90, textAlign: "right" }}>{msek(bondAmt)}</span>
                </div>
                <div style={S.amortRow}>
                  <input type="range" min={3} max={10} step={1}
                    value={bondYears} onChange={(e) => setBondYears(+e.target.value)}
                    style={{ flex: 1, accentColor: "#1a4a6b" }} />
                  <span style={{ minWidth: 90, textAlign: "right" }}>{bondYears} yr</span>
                </div>
                <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 6 }}
                  onClick={() => dispatch({ type: "ISSUE_BOND", amount: bondAmt, years: bondYears })}>
                  Issue bond
                </button>
                {(() => {
                  const esg = esgRatingOf(state);
                  const eligible = esg.letter === "A" || esg.letter === "B";
                  return (
                    <>
                      <button style={{ ...S.amortBtn, background: eligible ? "#27660a" : "#888", marginBottom: 4 }}
                        disabled={!eligible}
                        title={eligible ? "Lower coupon, but the ESG rating must stay at B or better — slipping triggers the greenwashing covenant." : `Requires ESG rating B or better (currently ${esg.letter}).`}
                        onClick={() => dispatch({ type: "ISSUE_BOND", amount: bondAmt, years: bondYears, green: true })}>
                        🌱 Issue green bond (coupon −{GREEN_BOND_DISCOUNT.toFixed(2)}pp)
                      </button>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                        {eligible
                          ? `ESG ${esg.letter} qualifies for green funding. Covenant: if the rating slips below B, the coupon rises +0.50pp and reputation takes a hit.`
                          : `Green bonds require ESG rating B or better (currently ${esg.letter}). Upgrade the portfolio's energy classes.`}
                      </div>
                    </>
                  );
                })()}
                {(state.bonds ?? []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Outstanding bonds:</div>
                    {(state.bonds ?? []).map((b) => {
                      // Marknadspris: har marknadskupongen stigit sedan
                      // emissionen handlas obligationen under par.
                      const market = bondRateFor(state, rating.rating);
                      const priceMult = Math.max(0.85, Math.min(1.12, b.rate / Math.max(0.5, market)));
                      const price = Math.round(b.amount * priceMult);
                      return (
                        <div key={b.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid #eee" }}>
                          <span>
                            {b.green ? "🌱 " : ""}{msek(b.amount)} @ {b.rate.toFixed(2)}%
                            {b.breached && <span style={{ color: "#c0392b", fontWeight: 700 }}> · covenant breached</span>}
                          </span>
                          <span style={{ display: "flex", gap: 4 }}>
                            <button
                              style={{ fontSize: 11, cursor: "pointer", border: `1px solid ${priceMult < 1 ? "#27660a" : "#888"}`, background: "transparent", color: priceMult < 1 ? "#27660a" : "#555", borderRadius: 3, padding: "1px 6px" }}
                              title={`Market price ${Math.round(priceMult * 100)}% of par — ${priceMult < 1 ? "buy back below face value" : "trading above face value"}`}
                              onClick={() => dispatch({ type: "BUYBACK_BOND", bondId: b.id })}>
                              Buy back {msek(price)}
                            </button>
                            <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", borderRadius: 3, padding: "1px 6px" }}
                              onClick={() => dispatch({ type: "REPAY_BOND", bondId: b.id })}>
                              Repay par
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Commercial paper</h3>
            {(() => {
              const cp = state.commercialPaper;
              const cap = Math.round(equity * CP_MAX_OF_EQUITY);
              const room = Math.max(0, cap - (cp?.amount ?? 0));
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    Short funding at {(state.interestRate + CP_SPREAD).toFixed(2)}% (bank rate {terms.rate.toFixed(2)}%),
                    rolled every {CP_TERM_MONTHS} mo. Cap {Math.round(CP_MAX_OF_EQUITY * 100)}% of equity ({msek(cap)}).
                    In a crisis the market freezes — the paper is repaid or bridged into expensive bank debt.
                  </div>
                  {cp && (
                    <>
                      <Line l="Outstanding" v={msek(cp.amount)} />
                      <Line l="Rate" v={`${cp.rate.toFixed(2)}%`} />
                      <Line l="Next rollover" v={`${Math.max(0, cp.matureAbs - (state.year * 12 + state.month))} mo`} />
                      <button style={{ ...S.amortBtn, marginBottom: 6 }}
                        disabled={state.cash < cp.amount}
                        onClick={() => dispatch({ type: "REPAY_CP" })}>
                        Repay program ({msek(cp.amount)})
                      </button>
                    </>
                  )}
                  {room >= 1_000_000 && (
                    <>
                      <div style={S.amortRow}>
                        <input type="range" min={1000000} max={room} step={1000000}
                          value={Math.min(cpAmt, room)} onChange={(e) => setCpAmt(+e.target.value)}
                          style={{ flex: 1, accentColor: "#1a4a6b" }} />
                        <span style={{ minWidth: 90, textAlign: "right" }}>{msek(Math.min(cpAmt, room))}</span>
                      </div>
                      <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 6 }}
                        onClick={() => dispatch({ type: "ISSUE_CP", amount: cpAmt })}>
                        📃 Issue commercial paper
                      </button>
                    </>
                  )}
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Investor relations</h3>
            {(() => {
              const irCost = Math.max(IR_COST_MIN, Math.round(equity * IR_COST_OF_EQUITY));
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Transparency and roadshows: +{IR_RATING_BONUS} rating points (better bond coupon
                    and a larger program) for {kr(irCost)}/mo.
                  </div>
                  <button style={{ ...S.amortBtn, background: state.irProgram ? "#555" : "#1a4a6b", marginBottom: 6 }}
                    onClick={() => dispatch({ type: "TOGGLE_IR", on: !state.irProgram })}>
                    {state.irProgram ? "📊 Discontinue IR program" : "📊 Launch IR program"}
                  </button>
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Convertibles</h3>
            {(() => {
              if (!state.ipoActive)
                return <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Requires a listed company — convertibles trade coupon for dilution risk.</div>;
              const capC = Math.round(equity * CONVERTIBLE_MAX_OF_EQUITY);
              const held = (state.convertibles ?? []).reduce((a, c) => a + c.amount, 0);
              const room = Math.max(0, capC - held);
              const cvRate = Math.max(1, +(bondRateFor(state, rating.rating) - CONVERTIBLE_RATE_DISCOUNT).toFixed(2));
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Coupon {cvRate.toFixed(2)}% (bonds −{CONVERTIBLE_RATE_DISCOUNT.toFixed(1)}pp). Converts to new
                    shares if the price reaches {Math.round(CONVERTIBLE_TRIGGER * 100)}% of issue price — cheap
                    debt that can become dilution. Cap {msek(capC)}.
                  </div>
                  {(state.convertibles ?? []).map((c, i) => (
                    <Line key={i} l={`${msek(c.amount)} @ ${c.rate.toFixed(2)}%`}
                      v={`converts @ $${(c.issuePrice * CONVERTIBLE_TRIGGER).toFixed(2)}`} />
                  ))}
                  {room >= 1_000_000 && (
                    <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 6 }}
                      onClick={() => dispatch({ type: "ISSUE_CONVERTIBLE", amount: Math.min(bondAmt, room) })}>
                      📜 Issue convertible ({msek(Math.min(bondAmt, room))} — uses the bond slider)
                    </button>
                  )}
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Rival bonds</h3>
            {(() => {
              const held = state.rivalBonds ?? [];
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Buy the rivals' corporate paper: coupon over your bank rate with a risk premium
                    by their size and distress. Their bankruptcy is your loss — a merged issuer
                    recovers 60%.
                  </div>
                  {held.map((b, i) => (
                    <Line key={i} l={`${b.rival}`} v={`${msek(b.amount)} @ ${b.rate.toFixed(2)}% · ${Math.max(0, b.matureAbs - (state.year * 12 + state.month))} mo`} />
                  ))}
                  {state.competitors.slice(0, 5).map((c) => (
                    <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #eee" }}>
                      <span>{c.name} <span style={{ color: "#888" }}>(eq {msek(c.equity)})</span></span>
                      <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #1a4a6b", background: "transparent", color: "#1a4a6b", borderRadius: 3, padding: "1px 8px" }}
                        onClick={() => dispatch({ type: "BUY_RIVAL_BOND", rival: c.name, amount: 5_000_000 })}>
                        Buy $5M
                      </button>
                    </div>
                  ))}
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Dividend</h3>
            <Line l="Total paid out" v={kr(state.dividendsPaid ?? 0)} />
            <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
              Dividends are now paid under <strong>Company → Legacy</strong>, where they build
              the owner's private wealth.
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>
              Share issues, buybacks and the IPO live under <strong>Company → Group</strong>;
              listed spin-offs are managed from the <strong>Industry</strong> panel.
            </div>
          </div>
        </div>
      )}

      {/* ── Institut: ägd bank + försäkringsbolag ───────────────────── */}
      {tab === "institut" && (
        <div style={S.financeWrap}>
          {state.ownedBank && state.ownedInsurer && (
            <div style={{ ...S.financeCol, gridColumn: "1 / -1", padding: "10px 18px" }}>
              <span style={{ fontWeight: 800, color: "#27660a" }}>
                🏛️ Financial group: bank + insurer cross-sell each other's customers — +6% on the bank's interest net and the insurance premiums.
              </span>
            </div>
          )}
          {(state.companyLevel ?? 1) < 4 ? (
            <div style={S.financeCol}>
              <h3 style={S.h3OnLight}>Financial institutions</h3>
              <div style={{ fontSize: 12, color: "#888" }}>Owning a bank or insurer requires company level 4.</div>
            </div>
          ) : (
            <>
              <div style={S.financeCol}>
                <h3 style={S.h3OnLight}>🏦 Bank</h3>
                {state.ownedBank ? (
                  <div style={{ fontSize: 12, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{state.ownedBank.name}</div>
                    <Line l="Deposits" v={msek(state.ownedBank.deposits)} />
                    <Line l="Loans out" v={msek(state.ownedBank.loansOut)} />
                    <Line l="Est. net" v={`${kr(bankMonthlyNet(state.ownedBank, state))}/mo`} accent="#27660a" />
                    <Line l="Lifetime net" v={msek(state.ownedBank.totalNet)} />
                    <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
                      {(["försiktig", "balanserad", "aggressiv"] as const).map((st) => (
                        <button key={st}
                          style={{ fontSize: 11, cursor: "pointer", borderRadius: 10, padding: "3px 10px", fontWeight: 700,
                            border: `1px solid ${state.ownedBank!.stance === st ? BURGUNDY : "#bbb"}`,
                            background: state.ownedBank!.stance === st ? BURGUNDY : "transparent",
                            color: state.ownedBank!.stance === st ? "#f0e6c8" : "#555" }}
                          onClick={() => dispatch({ type: "SET_BANK_STANCE", stance: st })}>
                          {st === "försiktig" ? "Cautious" : st === "balanserad" ? "Balanced" : "Aggressive"}
                        </button>
                      ))}
                      <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", borderRadius: 3, padding: "3px 8px" }}
                        onClick={() => dispatch({ type: "SELL_BANK" })}>
                        Sell ({msek(Math.round(bankValue(state.ownedBank, state) * 0.85))})
                      </button>
                    </div>
                    {(() => {
                      const capital = bankCapitalOf(state.ownedBank!);
                      const required = bankRequiredCapital(state.ownedBank!);
                      const ok = capital >= required;
                      const extractRoom = Math.max(0, capital - required);
                      return (
                        <>
                          <Line l="Bank capital" v={msek(capital)} accent={ok ? "#27660a" : "#c0392b"} />
                          <Line l="Requirement (8% of lending)" v={msek(required)} />
                          {!ok && (
                            <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 4 }}>
                              ⚠️ Below the capital ratio — lending is throttled to 75% until you inject.
                            </div>
                          )}
                          <div style={S.amortRow}>
                            <input type="range" min={500000} max={100_000_000} step={500000}
                              value={capAmt} onChange={(e) => setCapAmt(+e.target.value)}
                              style={{ flex: 1, accentColor: "#1a4a6b" }} />
                            <span style={{ minWidth: 90, textAlign: "right" }}>{msek(capAmt)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                            <button style={{ ...S.amortBtn, marginTop: 0, background: "#1a4a6b", flex: 1 }}
                              disabled={state.cash < Math.min(capAmt, state.cash) || state.cash < 500_000}
                              onClick={() => dispatch({ type: "BANK_INJECT_CAPITAL", amount: capAmt })}>
                              Inject
                            </button>
                            <button style={{ ...S.amortBtn, marginTop: 0, background: "#555", flex: 1 }}
                              disabled={extractRoom < 500_000}
                              title={extractRoom < 500_000 ? "The capital requirement blocks a dividend" : ""}
                              onClick={() => dispatch({ type: "BANK_EXTRACT_CAPITAL", amount: capAmt })}>
                              Extract
                            </button>
                          </div>
                        </>
                      );
                    })()}
                    {(state.ownedBank.campaignMonthsLeft ?? 0) > 0 ? (
                      <div style={{ fontSize: 12, color: "#27660a", fontWeight: 700, marginBottom: 6 }}>
                        📣 Deposit campaign running — {state.ownedBank.campaignMonthsLeft} mo left (+25% deposit target).
                      </div>
                    ) : (
                      <button style={{ ...S.amortBtn, background: "#27660a", marginBottom: 6 }}
                        disabled={state.cash < depositCampaignCost(state.ownedBank)}
                        onClick={() => dispatch({ type: "START_DEPOSIT_CAMPAIGN" })}>
                        📣 Deposit campaign ({msek(depositCampaignCost(state.ownedBank))}) — +25% deposits for 12 mo
                      </button>
                    )}
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Lending book focus:</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      {(["fastighet", "blandat", "konsument"] as const).map((f) => {
                        const sel = (state.ownedBank!.focus ?? "blandat") === f;
                        return (
                          <button key={f}
                            style={{ fontSize: 11, cursor: "pointer", borderRadius: 10, padding: "3px 10px", fontWeight: 700,
                              border: `1px solid ${sel ? BURGUNDY : "#bbb"}`,
                              background: sel ? BURGUNDY : "transparent",
                              color: sel ? "#f0e6c8" : "#555" }}
                            title={f === "fastighet" ? "Lower margin, safe — but bust-sensitive" : f === "konsument" ? "Fat margin, risky — recession-sensitive" : "Balanced mix"}
                            onClick={() => dispatch({ type: "SET_BANK_FOCUS", focus: f })}>
                            {f === "fastighet" ? "Real estate" : f === "blandat" ? "Mixed" : "Consumer"}
                          </button>
                        );
                      })}
                    </div>
                    <button style={{ ...S.amortBtn, background: state.ownedBank.internalFunding ? "#555" : "#1a4a6b", marginBottom: 6 }}
                      title="The bank funds part of the group's debt: extra −0.20pp on your loan rate, but the external book (and bank earnings) shrinks by the same amount."
                      onClick={() => dispatch({ type: "SET_INTERNAL_FUNDING", on: !state.ownedBank!.internalFunding })}>
                      {state.ownedBank.internalFunding ? "Wind down internal funding" : "🏦 Fund the group internally (−0.20pp rate)"}
                    </button>
                    <button style={{ ...S.amortBtn, background: state.ownedBank.rivalLending ? "#555" : "#1a4a6b", marginBottom: 6 }}
                      title="+5pp lending volume — but distressed rivals become your credit losses."
                      onClick={() => dispatch({ type: "SET_RIVAL_LENDING", on: !state.ownedBank!.rivalLending })}>
                      {state.ownedBank.rivalLending ? "Wind down rival credit lines" : "🤝 Open credit lines to rivals (+volume, +risk)"}
                    </button>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      Aggressive lending earns more but bleeds in downturns. Your own loan rate is 0.30% lower while you own the bank.
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      The bank takes the city's deposits and lends at a margin. Deposits grow with
                      the city and your empire; your own loans get a 0.30% rate discount.
                    </div>
                    <button style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 8 }}
                      disabled={state.cash < bankPurchasePrice(equity)}
                      onClick={() => dispatch({ type: "BUY_BANK" })}>
                      🏦 Acquire Harbor City Savings Bank ({msek(bankPurchasePrice(equity))})
                    </button>
                  </>
                )}
              </div>

              <div style={S.financeCol}>
                <h3 style={S.h3OnLight}>🛡️ Insurance</h3>
                {state.ownedInsurer ? (
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{state.ownedInsurer.name}</div>
                    <Line l="Policies" v={state.ownedInsurer.policies.toLocaleString("en-US")} />
                    <Line l="Est. net" v={`${kr(insurerMonthlyNet(state.ownedInsurer, state))}/mo`} accent="#27660a" />
                    <Line l="Lifetime net" v={msek(state.ownedInsurer.totalNet)} />
                    <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
                      {(["låg", "marknad", "hög"] as const).map((p) => (
                        <button key={p}
                          style={{ fontSize: 11, cursor: "pointer", borderRadius: 10, padding: "3px 10px", fontWeight: 700,
                            border: `1px solid ${state.ownedInsurer!.pricing === p ? BURGUNDY : "#bbb"}`,
                            background: state.ownedInsurer!.pricing === p ? BURGUNDY : "transparent",
                            color: state.ownedInsurer!.pricing === p ? "#f0e6c8" : "#555" }}
                          onClick={() => dispatch({ type: "SET_INSURER_PRICING", pricing: p })}>
                          {p === "låg" ? "Low premiums" : p === "marknad" ? "Market" : "High premiums"}
                        </button>
                      ))}
                      <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", borderRadius: 3, padding: "3px 8px" }}
                        onClick={() => dispatch({ type: "SELL_INSURER" })}>
                        Sell ({msek(Math.round(insurerValue(state.ownedInsurer, state) * 0.85))})
                      </button>
                    </div>
                    <button style={{ ...S.amortBtn, background: state.ownedInsurer.rentGuarantee ? "#555" : "#27660a", marginBottom: 6 }}
                      title="Extra premiums per policy — but the claim ratio follows the cycle and passes 100% in a bust. A deliberately counter-cyclical risk."
                      onClick={() => dispatch({ type: "SET_RENT_GUARANTEE", on: !state.ownedInsurer!.rentGuarantee })}>
                      {state.ownedInsurer.rentGuarantee
                        ? `Discontinue rent guarantees (claim ratio now ${Math.round(rentGuaranteeClaimRatio(state) * 100)}%)`
                        : "🏠 Launch rent-guarantee policies (fat margin in stable times, bleeds in a bust)"}
                    </button>
                    <button style={{ ...S.amortBtn, background: state.ownedInsurer.reinsured ? "#555" : "#27660a", marginBottom: 6 }}
                      onClick={() => dispatch({ type: "SET_REINSURANCE", on: !state.ownedInsurer!.reinsured })}>
                      {state.ownedInsurer.reinsured
                        ? "Cancel reinsurance (full premiums, full exposure)"
                        : "🤝 Sign reinsurance (cede 12% of premiums, claim spikes −60%)"}
                    </button>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      Low premiums grow the book fast on thin margins. Your own property premiums are 40% cheaper while you own the insurer.
                      {state.ownedInsurer.reinsured ? " Reinsurance is active — catastrophe months hit 60% softer." : ""}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      The insurer writes property policies across the city. Pricing trades growth
                      against margin; your own premiums drop 40% while you own it.
                    </div>
                    <button style={{ ...S.amortBtn, background: "#1a4a6b" }}
                      disabled={state.cash < insurerPurchasePrice(equity)}
                      onClick={() => dispatch({ type: "BUY_INSURER" })}>
                      🛡️ Acquire Cronvalls Insurance Co. ({msek(insurerPurchasePrice(equity))})
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Skatt ───────────────────────────────────────────────────── */}
      {tab === "tax" && (
        <div style={S.financeWrap}>
          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Tax optimization</h3>
            {(() => {
              const aggressive = (state.taxDepreciationPolicy ?? "normal") === "aggressiv";
              const depRate = aggressive ? TAX_DEP_AGGRESSIVE : TAX_DEP_NORMAL;
              const netIncome = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0) / 12
                - (state.debt * ((state.rateMode === "fixed" && state.fixedRate != null ? state.fixedRate : loanTerms(state).rate) / 100)) / 12;
              const monthlyDep = state.portfolio.reduce((sum, p) => {
                if (p.status !== "klar") return sum;
                return sum + ((p.purchasePrice ?? p.askPrice) * depRate) / 12;
              }, 0);
              const energyACount = state.portfolio.filter(p => p.energyClass === "A" && p.status === "klar").length;
              const taxRate = Math.max(0.10, 0.22 - (energyACount > 0 ? 0.03 : 0));
              const carry = state.taxLossCarry ?? 0;
              const grossTaxable = Math.max(0, netIncome - monthlyDep);
              const taxableIncome = Math.max(0, grossTaxable - carry);
              const monthlyTax = Math.round(taxableIncome * taxRate);
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Depreciation policy:</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                    {(["normal", "aggressiv"] as const).map((p) => {
                      const sel = (state.taxDepreciationPolicy ?? "normal") === p;
                      return (
                        <button key={p}
                          style={{ fontSize: 11, cursor: "pointer", borderRadius: 10, padding: "3px 10px", fontWeight: 700,
                            border: `1px solid ${sel ? BURGUNDY : "#bbb"}`,
                            background: sel ? BURGUNDY : "transparent",
                            color: sel ? "#f0e6c8" : "#555" }}
                          onClick={() => dispatch({ type: "SET_TAX_POLICY", policy: p })}>
                          {p === "normal"
                            ? `Normal (${(TAX_DEP_NORMAL * 100).toFixed(1)}%/yr)`
                            : `Aggressive (${(TAX_DEP_AGGRESSIVE * 100).toFixed(0)}%/yr · audit risk)`}
                        </button>
                      );
                    })}
                  </div>
                  {aggressive && (
                    <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>
                      ⚠️ The aggressive shield saves tax every month, but an audit
                      (~{Math.round(TAX_AUDIT_CHANCE * 100 * 12)}%/yr) claws back the difference with a 40% surcharge and rep −3.
                    </div>
                  )}
                  <Line l="Estimated tax rate" v={`${Math.round(taxRate * 100)}%${energyACount > 0 ? " (−3% via class A)" : ""}`} />
                  <Line l="Deduction (depreciation/mo)" v={kr(Math.round(monthlyDep))} />
                  <Line l="Loss carryforward" v={carry > 0 ? kr(carry) : "$0"} accent={carry > 0 ? "#27660a" : undefined} />
                  {carry > 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                      Accumulated deficits offset future taxable profits automatically — loss months are not wasted.
                    </div>
                  )}
                  <Line l="Taxable income/mo" v={kr(Math.max(0, Math.round(taxableIncome)))} />
                  <Line l="Estimated tax/mo" v={kr(monthlyTax)} />
                  <Line l="Total tax paid" v={kr(state.totalTaxPaid ?? 0)} />
                  {energyACount === 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 6, padding: "6px 10px", background: "#f0f4f8", borderRadius: 4 }}>
                      💡 Upgrade properties to energy class A to lower the tax rate by 3 percentage points.
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Tax allocation reserves</h3>
            {(() => {
              const reserves = state.taxReserves ?? [];
              const annualPBT = Math.max(0, resultatrakning(state).resultatForeSkatt * 12);
              const cap = Math.round(annualPBT * TAX_RESERVE_MAX_PCT);
              const nowAbs = state.year * 12 + state.month;
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    Defer tax on up to {Math.round(TAX_RESERVE_MAX_PCT * 100)}% of annualized profit.
                    The reserve returns to taxation after 6 years — dissolve into a loss year
                    and the saving becomes permanent.
                  </div>
                  {reserves.map((r, i) => (
                    <Line key={i} l={`Reserve ${i + 1} (due in ${Math.max(0, r.dueAbs - nowAbs)} mo)`} v={msek(r.amount)} />
                  ))}
                  {reserves.length < TAX_RESERVE_MAX_COUNT && cap >= 500_000 && (
                    <>
                      <div style={S.amortRow}>
                        <input type="range" min={500000} max={cap} step={500000}
                          value={Math.min(reserveAmt, cap)} onChange={(e) => setReserveAmt(+e.target.value)}
                          style={{ flex: 1, accentColor: "#1a4a6b" }} />
                        <span style={{ minWidth: 90, textAlign: "right" }}>{msek(Math.min(reserveAmt, cap))}</span>
                      </div>
                      <button style={{ ...S.amortBtn, background: "#1a4a6b" }}
                        onClick={() => dispatch({ type: "ALLOCATE_TAX_RESERVE", amount: reserveAmt })}>
                        Allocate reserve (cap {msek(cap)})
                      </button>
                    </>
                  )}
                  {cap < 500_000 && reserves.length < TAX_RESERVE_MAX_COUNT && (
                    <div style={{ fontSize: 12, color: "#888" }}>Requires an annualized profit — nothing to defer right now.</div>
                  )}
                </>
              );
            })()}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Interest deduction cap</h3>
            {(() => {
              const monthlyNOI2 = totalNOI / 12;
              const monthlyInterest2 = annualInterest / 12;
              const nonDeductible = Math.max(0, monthlyInterest2 - Math.max(0, monthlyNOI2) * INTEREST_CAP_OF_NOI);
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                    Interest is tax-deductible up to {Math.round(INTEREST_CAP_OF_NOI * 100)}% of NOI —
                    extreme leverage loses its tax shield.
                  </div>
                  <Line l="Non-deductible interest/mo" v={nonDeductible > 0 ? kr(Math.round(nonDeductible)) : "$0"}
                    accent={nonDeductible > 0 ? "#c0392b" : "#27660a"} />
                </>
              );
            })()}

            {(state.spinOffs ?? []).length > 0 && (
              <>
                <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Group contributions</h3>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                  Cover your spin-offs' loss months with cash — the amount keeps the listed
                  company afloat and joins your loss carryforward.
                </div>
                <button style={{ ...S.amortBtn, background: state.groupContribution ? "#555" : "#1a4a6b", marginBottom: 6 }}
                  onClick={() => dispatch({ type: "SET_GROUP_CONTRIBUTION", on: !state.groupContribution })}>
                  {state.groupContribution ? "Deactivate group contributions" : "🏛️ Activate group contributions"}
                </button>
              </>
            )}

            <h3 style={{ ...S.h3OnLight, marginTop: 14 }}>Holding structure</h3>
            {state.holdingStructure ? (
              <div style={{ fontSize: 12, color: "#27660a", fontWeight: 700 }}>
                🏛️ Active — the group's tax rate is {Math.round(HOLDING_TAX_DELTA * 100)}pp lower permanently.
              </div>
            ) : (() => {
              const cost = Math.max(10_000_000, Math.round(equity * 0.005));
              const gated = (state.companyLevel ?? 1) < 5;
              return (
                <>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    A one-time group restructuring lowers the tax rate {Math.round(HOLDING_TAX_DELTA * 100)}pp permanently.
                    {gated ? " Requires company level 5." : ""}
                  </div>
                  <button style={{ ...S.amortBtn, background: gated ? "#888" : "#1a4a6b" }}
                    disabled={gated || state.cash < cost}
                    onClick={() => dispatch({ type: "FORM_HOLDING" })}>
                    🏛️ Form holding structure ({msek(cost)})
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
