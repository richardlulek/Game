/* Finanshubben – all finansiering samlad i ETT fönster med interna
   flikar (samma mönster som Bolagshubben): Översikt, Lån, Kapital-
   marknad, Institut och Skatt. Varje del kan växa vidare utan att
   överblicken går förlorad. */

import { useState } from "react";
import { esgRatingOf } from "../engine/esg";
import { LENDERS, amortInfoOf, loanTerms } from "../engine/finance";
import { bondRateFor, creditRatingOf } from "../engine/rating";
import { bankMonthlyNet, bankPurchasePrice, bankValue, insurerMonthlyNet, insurerPurchasePrice, insurerValue } from "../engine/finInstitutions";
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
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 10px", marginBottom: 8, borderRadius: 6,
              background: rating.score >= 60 ? "#eef8f2" : rating.score >= 36 ? "#fdf6e3" : "#fdecea",
              border: `1px solid ${rating.score >= 60 ? "#22a06b" : rating.score >= 36 ? "#c9a13b" : "#c0392b"}`,
            }}>
              <span style={{ fontSize: 12.5 }}>
                Credit rating <strong style={{ fontSize: 15 }}>{rating.rating}</strong>
                <span style={{ color: "#888" }}> · {rating.drivers.join(" · ")}</span>
              </span>
              <span style={{ fontSize: 11, color: "#888" }}>spread {rating.spreadDelta >= 0 ? "+" : ""}{rating.spreadDelta.toFixed(1)} pp</span>
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
            <Line l="Net operating income" v={kr(totalNOI)} accent="#27660a" />
            <Line l="Interest cost" v={"−" + kr(annualInterest)} accent="#c0392b" />
            <Line l="Cash flow" v={kr(totalNOI - annualInterest)} bold />
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
            <h3 style={S.h3OnLight}>Rate strategy</h3>
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
                <button
                  style={{ ...S.amortBtn, background: "#1a4a6b", marginBottom: 4 }}
                  onClick={() => dispatch({ type: "SET_RATE_MODE", mode: "fixed", months: 36 })}
                  disabled={state.debt === 0}
                >
                  Lock rate for 36 mo (fee 0.5% of debt)
                </button>
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
                {(state.bonds ?? []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Outstanding bonds:</div>
                    {(state.bonds ?? []).map((b) => (
                      <div key={b.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #eee" }}>
                        <span>{msek(b.amount)} @ {b.rate.toFixed(2)} %</span>
                        <button style={{ fontSize: 11, cursor: "pointer", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", borderRadius: 3, padding: "1px 6px" }}
                          onClick={() => dispatch({ type: "REPAY_BOND", bondId: b.id })}>
                          Repay
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={S.financeCol}>
            <h3 style={S.h3OnLight}>Dividend</h3>
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
                    <div style={{ fontSize: 11, color: "#888" }}>
                      Low premiums grow the book fast on thin margins. Your own property premiums are 40% cheaper while you own the insurer.
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
                  <Line l="Estimated tax rate" v={`${Math.round(taxRate * 100)}%${energyACount > 0 ? " (−3% via class A)" : ""}`} />
                  <Line l="Deduction (depreciation/mo)" v={kr(Math.round(monthlyDep))} />
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
        </div>
      )}
    </div>
  );
}
