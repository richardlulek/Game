import { useState } from "react";
import { msek, kr, pct } from "../engine/format";
import { loanTerms } from "../engine/finance";
import { industryAssetValue } from "../engine/industries";
import { acquisitionValuation } from "../engine/mna";
import { personaFor } from "../engine/rivalPersonas";
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
      <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, marginBottom: 20 }}>
        Acquisition flow
      </h2>

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
                      <div style={{ fontWeight: 700 }}>{msek(val.nav)}</div>
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
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>
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
