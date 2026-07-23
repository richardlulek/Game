import React, { useState } from "react";
import { msek, kr, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { propMarketValue, propNOI } from "../engine/property";
import { useUiStore } from "../store/uiStore";
import { industryAssetValue } from "../engine/industries";
import { DOMINANCE_DISTRICT_SHARE, HOSTILE_PREMIUM, MA_ADVISOR_FEE, PACKAGE_MIN_PROPS, PACKAGE_PHASE_MULT, VALUATION_UNCERTAINTY, acquisitionValuation, ddCostFor, ddDoneFor, districtShareAfter, divisionPrice, marketCapOf, swapAccepted } from "../engine/mna";
import { PROPERTY_SPINOFF_MIN, SPINOFF_CAP_RATE, SPINOFF_FLOATS, SPINOFF_MIN_LEVEL, propertySpinnable, propertySpinoffValuation, spinoffFee } from "../engine/spinoffs";
import { interestLabel, packageStats } from "../engine/selling";
import { rivalICR } from "../engine/rivalFinance";
import { personaFor } from "../engine/rivalPersonas";
import { CommitmentsPanel } from "./CommitmentsPanel";
import { RivalPortrait } from "./RivalPortrait";
import { STRATEGY_LABELS, type GameAction, type GameState } from "../engine/types";
import { DISTRICTS } from "../engine/data";
import { C, FONTS, BURGUNDY } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

export function AcquisitionPanel({ state, dispatch }: Props) {
  // Off-market bud state: propertyId -> bid amount
  const [offBids, setOffBids] = useState<Record<number, number>>({});
  // Rival bud state: propertyId -> bid amount
  const [rivalBids, setRivalBids] = useState<Record<number, number>>({});
  // Accordion open state: competitor name -> boolean
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});
  // M&A slider: competitor name -> acquisition amount
  const [maBids, setMaBids] = useState<Record<string, number>>({});
  const [swapSel, setSwapSel] = useState<Record<string, { mine?: number; theirs?: number; boot?: number }>>({});
  // Fastighets-avknoppning: float (25/40/60 %) per distrikt.
  const [spinFloat, setSpinFloat] = useState<Record<string, number>>({});
  // Flikar: köp / sälj / pågående – panelen var en enda lång rulle.
  const [dealTab, setDealTab] = useState<"buy" | "sell" | "deals">("buy");
  const requestOpen = useUiStore((s) => s.requestOpen);

  // Score world pool properties by yield potential
  const poolScored = [...(state.worldPool ?? [])]
    .map((p) => ({
      p,
      score: p.askPrice > 0 ? p.baseRent / p.askPrice : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Köpkalkylator
  const [calcPrice, setCalcPrice] = useState(5_000_000);
  const [calcRent, setCalcRent] = useState(30_000);
  const [calcOpex, setCalcOpex] = useState(25);
  const [calcVacancy, setCalcVacancy] = useState(8);
  const terms = loanTerms(state);
  const calcDown = Math.round(calcPrice * (1 - terms.maxLtv));
  const calcLoan = calcPrice - calcDown;
  const calcAnnualRent = calcRent * 12;
  const calcAnnualOpex = calcAnnualRent * (calcOpex / 100);
  const calcAnnualVacancy = calcAnnualRent * (calcVacancy / 100);
  const calcNOI = calcAnnualRent - calcAnnualOpex - calcAnnualVacancy;
  const calcInterest = calcLoan * (terms.rate / 100);
  const calcCashflow = calcNOI - calcInterest;
  const calcYield = calcPrice > 0 ? (calcNOI / calcPrice) * 100 : 0;
  const calcCashOnCash = calcDown > 0 ? (calcCashflow / calcDown) * 100 : 0;

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, marginBottom: 12 }}>
        Acquisition flow
      </h2>

      {/* Flikar: köp / sälj / pågående – bryter upp den långa rullen. */}
      {(() => {
        const tabs = [
          { id: "buy" as const, label: "🛒 Buy & grow", intro: "Bid off-market, pick off single buildings, buy a rival's district, or swallow a whole company." },
          { id: "sell" as const, label: "💰 Sell & divest", intro: "Turn buildings into cash: bundle a sale package, sell a district to a rival, or float one as a listed subsidiary." },
          { id: "deals" as const, label: "⏳ In progress", intro: "Everything live right now — negotiations, integrations, earn-outs and regulator conditions." },
        ];
        const active = tabs.find((t) => t.id === dealTab)!;
        return (
          <>
            <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.brass}44` }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDealTab(t.id)}
                  style={{
                    background: dealTab === t.id ? `${C.brass}18` : "none", border: "none", cursor: "pointer",
                    padding: "8px 16px", fontFamily: FONTS.heading, fontSize: 14, fontWeight: 700,
                    color: dealTab === t.id ? C.brassBright : C.creamSoft,
                    borderBottom: `2px solid ${dealTab === t.id ? C.brassBright : "transparent"}`,
                    borderTopLeftRadius: 5, borderTopRightRadius: 5,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p style={{ color: C.creamSoft, fontSize: 12, margin: "8px 2px 18px" }}>{active.intro}</p>
          </>
        );
      })()}

      {/* Åtaganden: allt som pågår – förhandlingar, integrationer, krav */}
      {dealTab === "deals" && <CommitmentsPanel state={state} dispatch={dispatch} />}

      {dealTab === "buy" && (<>
      {/* ── Köpkalkylator ─────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, background: "#1a1208", border: `1px solid ${C.brass}` }}>
        <h3 style={sectionHeadStyle}>Purchase calculator</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 13 }}>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Purchase price: {msek(calcPrice)}</label>
            <input type="range" min={500000} max={100_000_000} step={500000}
              value={calcPrice} onChange={(e) => setCalcPrice(+e.target.value)}
              style={{ width: "100%", accentColor: C.brass, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Monthly rent (per unit): {kr(calcRent)}</label>
            <input type="range" min={2000} max={200_000} step={1000}
              value={calcRent} onChange={(e) => setCalcRent(+e.target.value)}
              style={{ width: "100%", accentColor: C.brass, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Operating cost: {calcOpex}%</label>
            <input type="range" min={5} max={40} step={1}
              value={calcOpex} onChange={(e) => setCalcOpex(+e.target.value)}
              style={{ width: "100%", accentColor: C.brass, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Vacancy: {calcVacancy}%</label>
            <input type="range" min={0} max={30} step={1}
              value={calcVacancy} onChange={(e) => setCalcVacancy(+e.target.value)}
              style={{ width: "100%", accentColor: C.brass, marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 14 }}>
          {[
            { l: "Down payment", v: msek(calcDown), c: C.negative },
            { l: "NOI / yr", v: kr(calcNOI), c: calcNOI > 0 ? C.positive : C.negative },
            { l: "Cap rate", v: `${calcYield.toFixed(1)}%`, c: calcYield >= 5 ? C.positive : C.gold },
            { l: "Cash-on-cash", v: `${calcCashOnCash.toFixed(1)}%`, c: calcCashflow > 0 ? C.positive : C.negative },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: "#0e0b06", border: `1px solid ${C.brass}44`, borderRadius: 5, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.creamSoft, marginBottom: 3 }}>{l}</div>
              <div style={{ fontWeight: 700, color: c, fontSize: 14 }}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sektion 1: Deal flow ─────────────────────────────────── */}
      <section style={sectionStyle}>
        <h3 style={sectionHeadStyle}>Off-market opportunities</h3>
        {poolScored.length === 0 ? (
          <p style={{ color: C.creamSoft, fontSize: 13 }}>
            No off-market properties available right now. The world pool refills as properties expire from the market.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {poolScored.map(({ p, score }) => {
              const currentBid = offBids[p.id] ?? Math.round(p.askPrice * 1.1);
              return (
                <div key={p.id} style={cardStyle}>
                  <div style={{ fontWeight: 700, color: C.brassBright, fontSize: 13 }}>
                    {p.typeLabel} · {p.districtName}
                  </div>
                  <div style={{ fontSize: 12, color: C.creamSoft, marginTop: 4 }}>
                    {p.area} m² · Condition {Math.round(p.condition)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
                    <span>Ask: <strong>{msek(p.askPrice)}</strong></span>
                    <span style={{ color: C.gold }}>Yield: ~{pct(score)}</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 11, color: C.creamSoft }}>
                      Bid: {msek(currentBid)}
                    </label>
                    <input
                      type="range"
                      min={Math.round(p.askPrice * 0.9)}
                      max={Math.round(p.askPrice * 1.5)}
                      step={Math.round(p.askPrice * 0.01)}
                      value={currentBid}
                      onChange={(e) => setOffBids({ ...offBids, [p.id]: +e.target.value })}
                      style={{ width: "100%", accentColor: C.brass, marginTop: 4 }}
                    />
                  </div>
                  <button
                    onClick={() => dispatch({ type: "BID_OFFMARKET", propertyId: p.id, amount: currentBid })}
                    style={btnPrimaryStyle}
                  >
                    Place off-market bid
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Sektion 2: Rival portföljer ──────────────────────────── */}
      <section style={sectionStyle}>
        <h3 style={sectionHeadStyle}>Rival portfolios</h3>
        {state.competitors.length === 0 ? (
          <p style={{ color: C.creamSoft, fontSize: 13 }}>No active competitors.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.competitors.map((comp) => {
              const open = accordionOpen[comp.name] ?? false;
              return (
                <div key={comp.name} style={{ border: `1px solid ${C.brass}`, borderRadius: 6, overflow: "hidden" }}>
                  <button
                    onClick={() => setAccordionOpen({ ...accordionOpen, [comp.name]: !open })}
                    style={{
                      width: "100%",
                      background: C.woodDark,
                      border: "none",
                      padding: "12px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <RivalPortrait company={comp.name} size={36} />
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.brassBright, fontSize: 14 }}>
                          {comp.name}
                        </span>
                        {personaFor(comp.name) && (
                          <span style={{ fontSize: 11, color: C.creamSoft }}>{personaFor(comp.name)!.person}</span>
                        )}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: C.creamSoft, display: "flex", gap: 16 }}>
                      <span>{comp.portfolio.length} properties{(comp.industries ?? []).length > 0 ? ` · ${(comp.industries ?? []).length} industries` : ""}</span>
                      <span>Strategy: {comp.strategy ? STRATEGY_LABELS[comp.strategy] : "unknown"}</span>
                      <span style={{ color: C.brass }}>{open ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {open && (
                    <div style={{ background: C.felt, padding: 12 }}>
                      {comp.portfolio.length === 0 ? (
                        <p style={{ color: C.creamSoft, fontSize: 12 }}>The competitor has no properties.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {comp.portfolio.map((p) => {
                            const minBid = Math.round(p.askPrice * 0.90);
                            const maxBid = Math.round(p.askPrice * 1.50);
                            const curBid = rivalBids[p.id] ?? Math.round(p.askPrice * 1.15);
                            return (
                              <div key={p.id} style={{ ...cardStyle, background: C.feltLight }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                  <span style={{ fontWeight: 600, color: C.parchment }}>
                                    {p.typeLabel} · {p.districtName}
                                  </span>
                                  <span style={{ color: C.creamSoft }}>{msek(p.askPrice)}</span>
                                </div>
                                <div style={{ fontSize: 11, color: C.creamSoft, marginTop: 3 }}>
                                  {p.area} m² · Condition {Math.round(p.condition)}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <label style={{ fontSize: 11, color: C.creamSoft }}>
                                    Bid: {msek(curBid)} ({pct(curBid / p.askPrice - 1)} premium)
                                  </label>
                                  <input
                                    type="range"
                                    min={minBid}
                                    max={maxBid}
                                    step={Math.round(p.askPrice * 0.01)}
                                    value={curBid}
                                    onChange={(e) => setRivalBids({ ...rivalBids, [p.id]: +e.target.value })}
                                    style={{ width: "100%", accentColor: C.brass, marginTop: 4 }}
                                  />
                                </div>
                                <button
                                  onClick={() => dispatch({
                                    type: "OFFER_TO_RIVAL",
                                    competitorName: comp.name,
                                    propertyId: p.id,
                                    amount: curBid,
                                  })}
                                  style={btnSecondaryStyle}
                                >
                                  Buy from rival
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(comp.industries ?? []).length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11, color: C.creamSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                            Industries
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {(comp.industries ?? []).map((a) => {
                              const value = industryAssetValue(a, state);
                              const bidAmt = Math.round(value * 1.25);
                              const canAfford = state.cash >= bidAmt;
                              return (
                                <div key={a.id} style={{ ...cardStyle, background: C.feltLight }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                    <span style={{ fontWeight: 600, color: C.parchment }}>
                                      {a.sector === "hotell" ? "🏨" : a.sector === "energi" ? "⚡" : "📦"} {a.name} · {a.districtName}
                                    </span>
                                    <span style={{ color: C.creamSoft }}>value {msek(value)}</span>
                                  </div>
                                  <button
                                    onClick={() => dispatch({ type: "BUY_INDUSTRY_FROM_RIVAL", competitorName: comp.name, industryId: a.id, amount: bidAmt })}
                                    disabled={!canAfford}
                                    style={{ ...btnSecondaryStyle, opacity: canAfford ? 1 : 0.5, cursor: canAfford ? "pointer" : "default" }}
                                    title={canAfford ? "" : `Cash purchase – insufficient cash (${msek(bidAmt)})`}
                                  >
                                    Bid {msek(bidAmt)} (125% – guaranteed answer)
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Sektion 3: Förvärva hela bolag (M&A) ─────────────────── */}
      <section style={sectionStyle}>
        <h3 style={sectionHeadStyle}>Acquire entire companies</h3>

        {/* Investmentbanken: deal pipeline (batch 2) */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => dispatch({ type: "TOGGLE_MA_ADVISOR" })}
            style={{ ...btnPrimaryStyle, background: state.maAdvisor ? C.woodDark : BURGUNDY, padding: "6px 12px" }}
            title={`Månadsarvode ${msek(MA_ADVISOR_FEE)}: rivalernas balansräkningar och stress som underrättelser.`}
          >
            {state.maAdvisor ? "End M&A advisory mandate" : `Retain M&A advisors (${msek(MA_ADVISOR_FEE)}/mo)`}
          </button>
          {state.maAdvisor && (
            <div style={{ marginTop: 10, background: C.woodDark, border: `1px solid ${C.brass}66`, borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontWeight: 800, color: C.gold, fontSize: 12.5, marginBottom: 6 }}>🏦 Deal pipeline — the advisors' read on every balance sheet</div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.8fr 1.2fr", gap: "3px 10px", fontSize: 11.5 }}>
                <div style={{ color: C.creamSoft, fontWeight: 700 }}>Company</div>
                <div style={{ color: C.creamSoft, fontWeight: 700 }}>Equity</div>
                <div style={{ color: C.creamSoft, fontWeight: 700 }}>Debt</div>
                <div style={{ color: C.creamSoft, fontWeight: 700 }}>ICR</div>
                <div style={{ color: C.creamSoft, fontWeight: 700 }}>Read</div>
                {state.competitors.map((c) => {
                  const icr = rivalICR(state, c);
                  const stressed = c.cash < 0 || (c.icrBadMonths ?? 0) >= 2;
                  return (
                    <React.Fragment key={c.name}>
                      <div>{c.name}{c.small ? " 🌱" : ""}</div>
                      <div>{msek(c.equity)}</div>
                      <div>{(c.debt ?? 0) > 0 ? msek(c.debt!) : "—"}</div>
                      <div style={{ color: icr < 1 ? C.negativeBright : icr < 1.8 ? C.gold : C.positive, fontWeight: 700 }}>
                        {icr === Infinity ? "∞" : icr.toFixed(1)}
                      </div>
                      <div style={{ color: stressed ? C.negativeBright : icr < 1.8 ? C.gold : C.creamSoft }}>
                        {stressed ? "distressed — easy prey" : icr < 1.8 ? "rate-squeezed" : "solid"}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {state.competitors.filter((c) => (c.portfolio ?? []).length > 0).length === 0 ? (
          <p style={{ color: C.creamSoft, fontSize: 13 }}>
            No competitors with properties to acquire.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {state.competitors
              .filter((c) => (c.portfolio ?? []).length > 0)
              .map((comp) => {
                // Riktig förvärvskalkyl (engine/mna.ts): substansvärde netto
                // skuld + kapitaliserade synergier – inte en schablon.
                const val = acquisitionValuation(state, comp);
                const minPrice = Math.round(comp.equity * 1.30);
                const maxPrice = Math.round(comp.equity * 1.50);
                const defaultPrice = Math.round(comp.equity * 1.35);
                const curPrice = maBids[comp.name] ?? defaultPrice;
                const deal = state.pendingDeal;
                const absNow = state.year * 12 + state.month;
                const cooldownLeft = Math.max(0, (state.dealCooldowns?.[comp.name] ?? 0) - absNow);
                const dd = ddDoneFor(state, comp.name);
                const ddRunning = (state.ddInProgress ?? []).some((d) => d.target === comp.name);
                // Bedömning: budet jämförs med vad bolaget är värt FÖR DIG.
                const premium = val.totalValue > 0 ? curPrice / val.totalValue - 1 : 1;
                const goodDeal = premium <= 0;

                return (
                  <div key={comp.name} style={{ ...cardStyle, background: C.woodDark }}>
                    <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.brassBright, fontSize: 15 }}>
                      {comp.name}
                    </div>
                    <div style={{ fontSize: 12, color: C.creamSoft, marginTop: 4 }}>
                      Strategy: {comp.strategy ? STRATEGY_LABELS[comp.strategy] : "unknown"}
                      {comp.preferredDistrict ? ` (${DISTRICTS.find((d) => d.id === comp.preferredDistrict)?.name ?? comp.preferredDistrict})` : ""}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10, fontSize: 12 }}>
                      <div style={{ color: C.creamSoft }}>Properties:</div>
                      <div style={{ fontWeight: 700 }}>{comp.portfolio.length}</div>
                      <div style={{ color: C.creamSoft }}>Equity:</div>
                      <div style={{ fontWeight: 700 }}>{msek(comp.equity)}</div>
                      <div style={{ color: C.creamSoft }}>Net asset value:</div>
                      <div style={{ fontWeight: 700 }} title={dd ? "Verifierat i due diligence." : "Osäkert utan due diligence – böckerna kan ljuga."}>
                        {dd
                          ? `${msek(val.nav)} ✓`
                          : `${msek(Math.round(val.nav * (1 - VALUATION_UNCERTAINTY)))}–${msek(Math.round(val.nav * (1 + VALUATION_UNCERTAINTY)))}`}
                      </div>
                      <div style={{ color: C.creamSoft }}>· of which debt assumed:</div>
                      <div style={{ fontWeight: 700, color: val.debt > 0 ? C.negativeBright : C.parchment }}>
                        {val.debt > 0 ? `−${msek(val.debt)}` : "—"}
                      </div>
                      <div style={{ color: C.creamSoft }} title={`District overlap ${msek(val.synergies.district)} · Energy synergy ${msek(val.synergies.energy)} · Scale ${msek(val.synergies.scale)}`}>
                        Synergies (overlap/energy/scale):
                      </div>
                      <div style={{ fontWeight: 700, color: C.gold }} title={`District overlap ${msek(val.synergies.district)} · Energy synergy ${msek(val.synergies.energy)} · Scale ${msek(val.synergies.scale)}`}>
                        +{msek(val.synergies.total)}
                      </div>
                      <div style={{ color: C.creamSoft }}>Value to you:</div>
                      <div style={{ fontWeight: 800, color: C.brassBright }}>{msek(val.totalValue)}</div>
                    </div>
                    <div style={{
                      marginTop: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: goodDeal ? C.positive : C.negativeBright,
                    }}>
                      {goodDeal
                        ? `Bid is ${Math.abs(premium * 100).toFixed(0)}% BELOW the value to you — good deal.`
                        : `Bid is ${(premium * 100).toFixed(0)}% ABOVE the value to you — you're paying for prestige.`}
                    </div>
                    {!dd && (
                      <div style={{ marginTop: 6, fontSize: 11.5 }}>
                        {ddRunning ? (
                          <span style={{ color: C.gold }}>🔍 Due diligence under way — report coming.</span>
                        ) : (
                          <button
                            onClick={() => dispatch({ type: "START_DUE_DILIGENCE", competitorName: comp.name })}
                            style={{ ...btnPrimaryStyle, background: C.woodDark, padding: "4px 10px", fontSize: 11.5 }}
                            title="2 månader: exakta böcker, ingen risk för lik i garderoben efter köpet."
                          >
                            🔍 Due diligence ({msek(ddCostFor(state, comp))})
                          </button>
                        )}
                      </div>
                    )}
                    {/* ── Förhandlingen (M&A 2.0): bud → svar → avslut ── */}
                    {deal && deal.target === comp.name ? (
                      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: C.wood, border: `1px solid ${C.gold}66`, fontSize: 12 }}>
                        <div style={{ fontWeight: 800, color: C.gold, marginBottom: 4 }}>
                          Negotiation — round {deal.round} · your bid {msek(deal.offer)}
                        </div>
                        {deal.status === "waiting" && (
                          <div style={{ color: C.creamSoft }}>The owner is considering your bid — answer at the next month's close.</div>
                        )}
                        {deal.status === "countered" && deal.counter != null && (
                          <>
                            <div style={{ color: C.negativeBright, fontWeight: 700 }}>
                              Countered: the owner wants {msek(deal.counter)}.
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                              <button
                                onClick={() => dispatch({ type: "RAISE_DEAL", amount: deal.counter! })}
                                style={{ ...btnPrimaryStyle, background: BURGUNDY, padding: "6px 10px" }}
                              >
                                Meet at {msek(deal.counter)}
                              </button>
                              <button
                                onClick={() => dispatch({ type: "RAISE_DEAL", amount: Math.round((deal.offer + deal.counter!) / 2) })}
                                style={{ ...btnPrimaryStyle, background: C.woodDark, padding: "6px 10px" }}
                              >
                                Split: {msek(Math.round((deal.offer + deal.counter) / 2))}
                              </button>
                              <button onClick={() => dispatch({ type: "WITHDRAW_DEAL" })} style={{ ...btnPrimaryStyle, background: C.woodDark, padding: "6px 10px" }}>
                                Walk away
                              </button>
                            </div>
                          </>
                        )}
                        {deal.status === "accepted" && (
                          <>
                            <div style={{ color: C.positive, fontWeight: 700 }}>Agreed at {msek(deal.offer)} — choose financing to close:</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                              <button onClick={() => dispatch({ type: "FINALIZE_DEAL", financing: "kontant" })} style={{ ...btnPrimaryStyle, background: BURGUNDY, padding: "6px 10px" }} title="Full köpeskilling ur kassan – ingen ny skuld.">
                                Cash ({msek(deal.offer)})
                              </button>
                              <button onClick={() => dispatch({ type: "FINALIZE_DEAL", financing: "lan" })} style={{ ...btnPrimaryStyle, background: BURGUNDY, padding: "6px 10px" }} title="25 % kontant, resten banklån.">
                                Bank loan ({msek(Math.round(deal.offer * 0.25))} down)
                              </button>
                              <button onClick={() => dispatch({ type: "FINALIZE_DEAL", financing: "aktier" })} style={{ ...btnPrimaryStyle, background: state.ipoActive ? BURGUNDY : C.woodDark, padding: "6px 10px" }} title="Riktad emission till säljaren – ingen kassa, men utspädning (kräver börsnotering).">
                                Shares {state.ipoActive ? "" : "(requires IPO)"}
                              </button>
                              <button onClick={() => dispatch({ type: "FINALIZE_DEAL", financing: "earnout" })} style={{ ...btnPrimaryStyle, background: BURGUNDY, padding: "6px 10px" }} title="75 % nu, 25 % om 24 mån OM beståndet levererar 85 % av dagens driftnetto.">
                                Earn-out (75% now)
                              </button>
                              <button onClick={() => dispatch({ type: "WITHDRAW_DEAL" })} style={{ ...btnPrimaryStyle, background: C.woodDark, padding: "6px 10px" }}>
                                Walk away
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 11, color: C.creamSoft }}>
                            Indicative bid: {msek(curPrice)}
                          </label>
                          <input
                            type="range"
                            min={minPrice}
                            max={maxPrice}
                            step={Math.round(comp.equity * 0.01)}
                            value={curPrice}
                            onChange={(e) => setMaBids({ ...maBids, [comp.name]: +e.target.value })}
                            style={{ width: "100%", accentColor: BURGUNDY, marginTop: 4 }}
                          />
                        </div>
                        {cooldownLeft > 0 ? (
                          <div style={{ marginTop: 10, fontSize: 12, color: C.negativeBright, fontWeight: 700 }}>
                            The owner won't take your calls for {cooldownLeft} more month(s).
                          </div>
                        ) : (
                          <button
                            disabled={!!deal}
                            onClick={() => dispatch({ type: "PROPOSE_ACQUISITION", competitorName: comp.name, amount: curPrice })}
                            style={{
                              ...btnPrimaryStyle,
                              background: deal ? C.woodDark : BURGUNDY,
                              opacity: deal ? 0.5 : 1,
                              cursor: deal ? "default" : "pointer",
                              marginTop: 12,
                            }}
                            title={deal ? "En förhandling i taget." : "Ägaren svarar vid nästa månadsskifte: accept, motbud eller avvisat."}
                          >
                            {deal ? "Negotiation in progress elsewhere" : `Approach ${comp.name}'s owner`}
                          </button>
                        )}
                        {/* Divisionsköp: rivalens distriktsbestånd i ett paket */}
                        {(() => {
                          const byDistrict = new Map<string, number>();
                          for (const p of comp.portfolio ?? []) byDistrict.set(p.district, (byDistrict.get(p.district) ?? 0) + 1);
                          const divisions = [...byDistrict.entries()].filter(([, n]) => n >= 2);
                          if (divisions.length === 0) return null;
                          return (
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {divisions.map(([district, n]) => (
                                <button
                                  key={district}
                                  onClick={() => dispatch({ type: "BUY_DIVISION", competitorName: comp.name, district })}
                                  style={{ ...btnPrimaryStyle, background: C.woodDark, fontSize: 11, padding: "4px 8px" }}
                                  title={`Hela ${comp.name}s bestånd i distriktet (${n} hus) i EN affär – 5 % paketpremie, 25 % kontant.`}
                                >
                                  🏙️ Buy {DISTRICTS.find((d) => d.id === district)?.name ?? district} division ({n}) · {msek(divisionPrice(state, comp, district))}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        {/* Byteshandel: hus mot hus, mellanskillnad kontant.
                            Live-förhandsvisning – slutar vara ett blint klick:
                            värden, kontant mellanskillnad och om rivalen tackar ja. */}
                        {(() => {
                          const myKlar = state.portfolio.filter((p) => p.status === "klar");
                          if (myKlar.length === 0 || (comp.portfolio ?? []).length === 0) return null;
                          const sel = swapSel[comp.name] ?? {};
                          const mine = myKlar.find((p) => p.id === sel.mine);
                          const theirs = (comp.portfolio ?? []).find((p) => p.id === sel.theirs);
                          const both = !!(mine && theirs);
                          // Jämnt värde: deras värde − ditt (positivt = du betalar).
                          const fair = both ? Math.round(propMarketValue(theirs!, state) - propMarketValue(mine!, state)) : 0;
                          const boot = sel.boot ?? fair; // ditt bud på mellanskillnaden
                          const fit = mine ? swapAccepted(state, comp, mine.district) : false;
                          const meetsFair = boot >= fair; // annars kontrar rivalen
                          const shortCash = boot > 0 && state.cash < boot;
                          const homeName = comp.preferredDistrict
                            ? DISTRICTS.find((d) => d.id === comp.preferredDistrict)?.name ?? comp.preferredDistrict
                            : null;
                          const canPropose = both && fit && meetsFair && !shortCash;
                          const bootSpan = both ? Math.max(1_000_000, Math.round(Math.abs(fair) + Math.max(propMarketValue(mine!, state), propMarketValue(theirs!, state)) * 0.3)) : 1;
                          return (
                            <div style={{ marginTop: 8, fontSize: 11 }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                <span style={{ color: C.creamSoft }}>🔁 Swap:</span>
                                <select
                                  value={sel.mine ?? ""}
                                  onChange={(e) => setSwapSel({ ...swapSel, [comp.name]: { ...sel, mine: +e.target.value, boot: undefined } })}
                                  style={{ background: C.woodDark, color: C.parchment, border: `1px solid ${C.brass}66`, borderRadius: 4, fontSize: 11 }}
                                >
                                  <option value="">your building…</option>
                                  {myKlar.map((p) => (
                                    <option key={p.id} value={p.id}>{p.typeLabel} · {p.districtName}</option>
                                  ))}
                                </select>
                                <select
                                  value={sel.theirs ?? ""}
                                  onChange={(e) => setSwapSel({ ...swapSel, [comp.name]: { ...sel, theirs: +e.target.value, boot: undefined } })}
                                  style={{ background: C.woodDark, color: C.parchment, border: `1px solid ${C.brass}66`, borderRadius: 4, fontSize: 11 }}
                                >
                                  <option value="">their building…</option>
                                  {(comp.portfolio ?? []).map((p) => (
                                    <option key={p.id} value={p.id}>{p.typeLabel} · {p.districtName}</option>
                                  ))}
                                </select>
                                <button
                                  disabled={!canPropose}
                                  onClick={() => dispatch({ type: "PROPOSE_SWAP", myPropertyId: sel.mine!, rivalName: comp.name, rivalPropertyId: sel.theirs!, cashBoot: boot })}
                                  style={{ ...btnPrimaryStyle, background: canPropose ? BURGUNDY : C.woodDark, fontSize: 11, padding: "4px 8px", opacity: canPropose ? 1 : 0.5, cursor: canPropose ? "pointer" : "default" }}
                                  title="Bjud en mellanskillnad. Under det jämna värdet kontrar rivalen. Distriktsbolag vill ha sin stadsdel; andra kräver standing ≥ 20. Lyckad affär: standing +8."
                                >
                                  Propose
                                </button>
                              </div>
                              {both && (
                                <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 5, background: C.woodDark, border: `1px solid ${canPropose ? `${C.brass}66` : `${C.negativeBright}55`}` }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", color: C.creamSoft }}>
                                    <span>Give {msek(propMarketValue(mine!, state))}</span>
                                    <span>Get {msek(propMarketValue(theirs!, state))}</span>
                                  </div>
                                  {/* Förhandla mellanskillnaden – bjud lägre, rivalen kontrar. */}
                                  <div style={{ marginTop: 6 }}>
                                    <label style={{ color: C.creamSoft }}>
                                      Your cash offer: {boot > 0 ? `you pay ${msek(boot)}` : boot < 0 ? `rival pays you ${msek(-boot)}` : "even, no cash"}
                                    </label>
                                    <input
                                      type="range"
                                      min={fair - bootSpan}
                                      max={fair + bootSpan}
                                      step={Math.max(50_000, Math.round(bootSpan / 60))}
                                      value={boot}
                                      onChange={(e) => setSwapSel({ ...swapSel, [comp.name]: { ...sel, boot: +e.target.value } })}
                                      style={{ width: "100%", accentColor: C.brass, marginTop: 2 }}
                                    />
                                  </div>
                                  <div style={{ marginTop: 3, fontWeight: 700, color: canPropose ? C.positive : C.negativeBright }}>
                                    {!fit
                                      ? `✖ ${comp.name} won't — ${comp.strategy === "distrikt" && homeName ? `give a building in ${homeName}, or ` : ""}warm the relationship (standing ≥ 20).`
                                      : !meetsFair
                                        ? `✖ ${comp.name} counters: at least ${msek(fair)} (you offered ${msek(boot)}).`
                                        : shortCash
                                          ? "✖ Insufficient cash for your offer."
                                          : `✅ ${comp.name} will accept this swap.`}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {/* Olivkvisten: reparera en frostig relation aktivt */}
                        {(() => {
                          const standing = state.standing?.rivals?.[comp.name] ?? 0;
                          const obCost = Math.max(500_000, Math.min(5_000_000, Math.round(comp.equity * 0.005)));
                          const obUntil = state.oliveBranchCooldowns?.[comp.name] ?? 0;
                          const obLeft = Math.max(0, obUntil - absNow);
                          return (
                            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                              <span style={{ color: standing < -20 ? C.negativeBright : standing > 20 ? C.positive : C.creamSoft }}>
                                Relation: {standing > 0 ? "+" : ""}{standing.toFixed(0)}
                              </span>
                              {obLeft > 0 ? (
                                <span style={{ color: C.creamSoft }}>🕊️ next gesture in {obLeft} mo</span>
                              ) : (
                                <button
                                  onClick={() => dispatch({ type: "SEND_OLIVE_BRANCH", rivalName: comp.name })}
                                  disabled={state.cash < obCost}
                                  style={{ ...btnPrimaryStyle, background: C.woodDark, fontSize: 11, padding: "3px 8px", opacity: state.cash < obCost ? 0.5 : 1 }}
                                  title="En synlig gest – gala i rivalens namn. Standing +6, rep +1. En per halvår och rival."
                                >
                                  🕊️ Olive branch ({msek(obCost)})
                                </button>
                              )}
                            </div>
                          );
                        })()}
                        {(() => {
                          const cap = marketCapOf(state, comp.name);
                          if (cap <= 0 || deal || state.hostileBid) return null;
                          const hostileMin = Math.round(cap * HOSTILE_PREMIUM);
                          return (
                            <button
                              onClick={() => dispatch({ type: "HOSTILE_BID", competitorName: comp.name, amount: hostileMin })}
                              disabled={state.cash < Math.round(hostileMin * 0.25)}
                              style={{ ...btnPrimaryStyle, background: C.woodDark, border: `1px solid ${C.negativeBright}66`, marginTop: 6, fontSize: 11.5, padding: "6px 10px", opacity: state.cash < Math.round(hostileMin * 0.25) ? 0.5 : 1 }}
                              title="Gå förbi styrelsen till aktieägarna: 125 % av börsvärdet. Styrelsen kan svara med vit riddare eller återköp – och staden minns en raid."
                            >
                              ⚔️ Hostile bid ({msek(hostileMin)})
                            </button>
                          );
                        })()}
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>
      </>)}

      {dealTab === "sell" && (<>
      {/* ── Säljpaket: nu samlade här i stället för att ligga ensamma i
            portföljfliken. Aktiva paket + snabbskapa per distrikt. ──── */}
      <section style={sectionStyle}>
        <h3 style={sectionHeadStyle}>📦 Sale packages</h3>
        <p style={{ color: C.creamSoft, fontSize: 12, marginBottom: 12 }}>
          Bundle finished buildings and list them to institutional buyers — volume earns a package
          premium, and offers land in your 📨 inbox. Withdraw any time.
        </p>
        {(() => {
          const pkgOffers = (state.offers ?? []).filter((o) => o.packageId != null);
          if (pkgOffers.length === 0) return null;
          return (
            <button
              onClick={() => requestOpen("offers")}
              style={{ ...btnPrimaryStyle, width: "auto", marginTop: 0, marginBottom: 12, background: BURGUNDY, fontSize: 12.5, padding: "7px 14px" }}
              title="Open the offers inbox to accept, counter or decline."
            >
              📨 {pkgOffers.length} package offer{pkgOffers.length > 1 ? "s" : ""} waiting — open inbox →
            </button>
          );
        })()}
        {(state.salePackages ?? []).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {(state.salePackages ?? []).map((pkg) => {
              const st = packageStats(pkg, state);
              const il = interestLabel(st.chance);
              return (
                <div key={pkg.id} style={{ ...cardStyle, background: C.woodDark, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5 }}>
                    <strong style={{ color: C.brassBright }}>{pkg.name}</strong> · {pkg.propertyIds.length} properties · asking {msek(pkg.ask)}
                    <span style={{ color: C.creamSoft }}> · value {msek(st.value)} (+{Math.round((st.premium - 1) * 100)}% premium)</span>
                  </span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center", whiteSpace: "nowrap" }}>
                    <span style={{ color: il.color, fontWeight: 700, fontSize: 11.5 }}>{il.label}</span>
                    <button
                      style={{ background: "transparent", border: `1px solid ${C.brass}66`, color: C.creamSoft, borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}
                      onClick={() => dispatch({ type: "UNLIST_PACKAGE", packageId: pkg.id })}
                    >
                      Withdraw
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {(() => {
          // Snabbskapa ett distriktspaket ur färdiga, ännu ej listade hus.
          const byDistrict = new Map<string, { label: string; ids: number[]; value: number }>();
          for (const p of state.portfolio) {
            if (p.status !== "klar" || p.forSale) continue;
            const e = byDistrict.get(p.district) ?? { label: p.districtName, ids: [], value: 0 };
            e.ids.push(p.id);
            e.value += propMarketValue(p, state);
            byDistrict.set(p.district, e);
          }
          const eligible = [...byDistrict.values()].filter((e) => e.ids.length >= 2);
          if (eligible.length === 0)
            return <p style={{ color: C.creamSoft, fontSize: 12 }}>Need 2+ finished, unlisted buildings in a district to bundle a quick package — or hand-pick across districts in the Portfolio tab.</p>;
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {eligible.map((e) => (
                <button
                  key={e.label}
                  onClick={() => dispatch({ type: "LIST_PACKAGE", ids: e.ids, ask: Math.round(e.value) })}
                  style={{ ...btnPrimaryStyle, background: C.woodDark, width: "auto", marginTop: 0, fontSize: 12, padding: "6px 12px" }}
                  title="Lista hela distriktets färdiga hus som ett paket. Finjustera urval och pris i Portfölj-fliken."
                >
                  📦 Package {e.label} ({e.ids.length}) · ask ~{msek(Math.round(e.value))}
                </button>
              ))}
            </div>
          );
        })()}
        <p style={{ color: C.creamSoft, fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
          Tip: to hand-pick buildings across districts, tick them in the Portfolio tab and “Create sale package”.
        </p>
      </section>

      {/* ── Sektion 4: Sälj paketbolag (säljsidans M&A) ───────────── */}
      <section style={sectionStyle}>
        <h3 style={sectionHeadStyle}>Sell a portfolio company</h3>
        {(() => {
          const byDistrict = new Map<string, number>();
          for (const p of state.portfolio) {
            if (p.status === "klar") byDistrict.set(p.district, (byDistrict.get(p.district) ?? 0) + 1);
          }
          const packages = [...byDistrict.entries()].filter(([, n]) => n >= PACKAGE_MIN_PROPS);
          if (packages.length === 0)
            return <p style={{ color: C.creamSoft, fontSize: 13 }}>Needs {PACKAGE_MIN_PROPS}+ completed properties in one district to package.</p>;
          const phase = (state.marketCycle?.phase ?? "stable") as "boom" | "stable" | "bust";
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {packages.map(([district, n]) => {
                const est = Math.round(
                  state.portfolio
                    .filter((p) => p.district === district && p.status === "klar")
                    .reduce((a, p) => a + propMarketValue(p, state), 0) * PACKAGE_PHASE_MULT[phase],
                );
                return (
                  <button
                    key={district}
                    onClick={() => dispatch({ type: "SELL_PORTFOLIO_COMPANY", district })}
                    style={{ ...btnPrimaryStyle, background: C.woodDark, fontSize: 12, padding: "6px 10px" }}
                    title={`Hela ditt bestånd i distriktet säljs som paketbolag till bäst kapitaliserade rival. Priset följer konjunkturen (boom +5 %, bust −15 %).`}
                  >
                    🏷️ {DISTRICTS.find((d) => d.id === district)?.name ?? district} ({n} properties) · ~{msek(est)}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Fastighets-avknoppning: notera ett distrikt som eget PropCo och
            behåll kontrollen. Skiljer sig från paketförsäljningen ovan – här
            säljer du bara en MINORITET och behåller resten + utdelningen. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.brass}33` }}>
          <div style={{ fontFamily: FONTS.heading, color: C.brass, fontSize: 13, marginBottom: 4 }}>
            🏢 Spin off a district as a listed subsidiary
          </div>
          <p style={{ color: C.creamSoft, fontSize: 11.5, marginBottom: 6 }}>
            Float part of a district's buildings as their own listed company (PropCo). The
            buildings stay on the map but their rent flows to the subsidiary, which pays you
            quarterly dividends on the stake you keep. Requires company level {SPINOFF_MIN_LEVEL}.
          </p>
          <p style={{ color: C.gold, fontSize: 11.5, marginBottom: 10, fontStyle: "italic" }}>
            Why do this? Raise capital <strong>without giving up control or debt</strong> — unlike a
            package sale you keep the majority and the upside. Best on a high-yield district: the
            market prices its rent above brick value, so you float at a premium, bank the cash, and
            can buy the shares back cheap in a downturn. It's also a lawful way around the{" "}
            <strong>dominance rules</strong>: floating out a majority drops your counted share of a
            district you own too much of, so the regulator lets go — no fire-sale.
          </p>
          {(() => {
            if ((state.companyLevel ?? 1) < SPINOFF_MIN_LEVEL)
              return <p style={{ color: C.creamSoft, fontSize: 12 }}>Reach company level {SPINOFF_MIN_LEVEL} (group stage) to list a subsidiary.</p>;
            const byDistrict = new Map<string, string>();
            for (const p of state.portfolio) {
              if (propertySpinnable(state, p.district).length >= PROPERTY_SPINOFF_MIN) byDistrict.set(p.district, p.districtName);
            }
            if (byDistrict.size === 0)
              return <p style={{ color: C.creamSoft, fontSize: 12 }}>Needs {PROPERTY_SPINOFF_MIN}+ completed, un-listed buildings in one district.</p>;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[...byDistrict.entries()].map(([district, label]) => {
                  const spinProps = propertySpinnable(state, district);
                  const n = spinProps.length;
                  const valuation = propertySpinoffValuation(state, district);
                  const float = spinFloat[district] ?? 0.4;
                  const proceeds = Math.round(valuation * float) - spinoffFee(valuation);
                  // Premien: värderar börsen hyran över tegelvärdet? Det är själva
                  // poängen med avknoppningen – flotta högt, behåll kontrollen.
                  const book = spinProps.reduce((a, p) => a + propMarketValue(p, state), 0);
                  const earnings = spinProps.reduce((a, p) => a + propNOI(p, state), 0) / SPINOFF_CAP_RATE;
                  const premium = book > 0 ? earnings / book - 1 : 0;
                  return (
                    <div key={district} style={{ ...cardStyle, background: C.woodDark, minWidth: 230 }}>
                      <div style={{ fontWeight: 700, color: C.brassBright, fontSize: 13 }}>{label} PropCo</div>
                      <div style={{ fontSize: 11.5, color: C.creamSoft, marginTop: 3 }}>
                        {n} buildings · valuation {msek(valuation)}
                      </div>
                      {premium > 0.02 && (
                        <div style={{ fontSize: 11, color: C.positive, marginTop: 3, fontWeight: 700 }}>
                          📈 Market prices the rent +{Math.round(premium * 100)}% over brick value
                        </div>
                      )}
                      {(() => {
                        const dom = districtShareAfter(state, district);
                        if (!(dom.total >= 6 && dom.share > DOMINANCE_DISTRICT_SHARE - 0.05)) return null;
                        return (
                          <div style={{ fontSize: 11, color: C.gold, marginTop: 3, fontWeight: 700 }}>
                            ⚖️ You hold {pct(dom.share)} here — a float cuts your counted dominance below the {Math.round(DOMINANCE_DISTRICT_SHARE * 100)}% line.
                          </div>
                        );
                      })()}
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {SPINOFF_FLOATS.map((f) => (
                          <button
                            key={f}
                            onClick={() => setSpinFloat({ ...spinFloat, [district]: f })}
                            style={{
                              flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${C.brass}66`,
                              background: float === f ? BURGUNDY : "transparent",
                              color: float === f ? C.parchment : C.creamSoft,
                            }}
                          >
                            {Math.round(f * 100)}%
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, marginTop: 8, color: proceeds > 0 ? C.positive : C.negativeBright, fontWeight: 700 }}>
                        Net proceeds ~{msek(proceeds)} · keep {Math.round((1 - float) * 100)}% + quarterly dividends
                      </div>
                      <button
                        disabled={proceeds <= 0}
                        onClick={() => dispatch({ type: "SPIN_OFF_PROPERTIES", district, floatPct: float })}
                        style={{ ...btnPrimaryStyle, background: proceeds > 0 ? BURGUNDY : C.woodDark, opacity: proceeds > 0 ? 1 : 0.5, cursor: proceeds > 0 ? "pointer" : "default", fontSize: 12 }}
                        title="Notera distriktet som eget PropCo. Husen stannar på kartan; hyran går till dottern som delar ut kvartalsvis."
                      >
                        List {label} PropCo
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>
      </>)}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 28,
  borderBottom: `1px solid ${C.brass}44`,
  paddingBottom: 20,
};

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: FONTS.heading,
  color: C.brass,
  fontSize: 15,
  marginBottom: 14,
};

const cardStyle: React.CSSProperties = {
  background: C.woodLight,
  border: `1px solid ${C.brass}66`,
  borderRadius: 7,
  padding: "12px 14px",
};

const btnPrimaryStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  background: BURGUNDY,
  color: C.parchment,
  border: "none",
  borderRadius: 5,
  padding: "8px 0",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  background: C.green,
  color: C.parchment,
  border: "none",
  borderRadius: 5,
  padding: "7px 0",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
