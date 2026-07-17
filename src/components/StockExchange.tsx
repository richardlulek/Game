/* ============================================================
   Börsen – levande handelsterminal: rullande ticker, sorterbar och
   sökbar kurslista med kursflash, samt en rik detaljvy per aktie med
   graf, fundamenta, rivalinsyn, uppköpsdrama och nyhetshistorik.
   Inline-stilar, inga externa beroenden.
   ============================================================ */

import { useMemo, useState } from "react";
import { calYear } from "../engine/date";
import { kr, msek, pct } from "../engine/format";
import { COURTAGE, stockHoldingsValue } from "../engine/stocks";
import type { Competitor, GameAction, GameState, LimitOrder, Sector, Stock } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";
import { AreaChart, FlashCell, GoldRule, Sparkline as Spark, signed, trendColor } from "./ui";
import { RivalCard } from "./RivalCard";

interface StockExchangeProps {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

/** Branschfärger & etiketter. */
const SECTOR_COLOR: Record<Sector, string> = {
  fastighet: C.green,
  bank: "#2a4a8a",
  bygg: "#9a6a10",
  handel: "#7a3a6a",
  industri: C.inkSoft,
};
const SECTOR_LABEL: Record<Sector, string> = {
  fastighet: "Real estate",
  bank: "Bank",
  bygg: "Construction",
  handel: "Retail",
  industri: "Industry",
};

const STRATEGY_LABEL: Record<string, string> = {
  tillväxt: "Growth",
  utdelning: "Dividend",
  värde: "Value",
  distrikt: "District focus",
};

// ── Gemensamma stilar ──────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 6,
  padding: 16,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 6px 18px rgba(0,0,0,0.35)`,
};

const heading: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontWeight: 700,
  color: BURGUNDY,
  margin: 0,
};

const num: React.CSSProperties = { fontFamily: FONTS.heading };

const primaryBtn: React.CSSProperties = {
  background: BURGUNDY,
  color: C.brassBright,
  border: `1px solid ${C.brass}`,
  padding: "8px 14px",
  borderRadius: 4,
  fontWeight: 700,
  fontSize: 13,
  fontFamily: FONTS.body,
  letterSpacing: 0.4,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: C.ink,
  border: `1px solid ${C.brassDim}`,
  padding: "8px 14px",
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 13,
  fontFamily: FONTS.body,
  cursor: "pointer",
};

const disabledBtn: React.CSSProperties = {
  background: "#9a8f7a",
  color: "#dfe6f0",
  borderColor: "#8a7f6a",
  cursor: "default",
};

const stepBtn: React.CSSProperties = {
  width: 30,
  height: 32,
  background: C.wood,
  color: C.brassBright,
  border: `1px solid ${C.brass}`,
  borderRadius: 4,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
};

const qtyInput: React.CSSProperties = {
  width: 78,
  height: 32,
  textAlign: "center",
  border: `1px solid ${C.brassDim}`,
  background: "#f0f4f9",
  color: C.ink,
  borderRadius: 4,
  fontSize: 14,
  fontFamily: FONTS.heading,
  boxSizing: "border-box",
};

const subLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: C.inkSoft,
  fontWeight: 600,
};

// ── Hjälpkomponenter ───────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: NonNullable<Stock["analystRating"]> }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      background: rating === "Buy" ? C.green : rating === "Sell" ? C.negative : C.wood,
      color: C.creamText,
      padding: "2px 7px", borderRadius: 10,
    }}>
      {rating}
    </span>
  );
}

// ── Rullande kursremsa (ticker-tape, feature 4) ─────────────────────────

function TickerTape({ stocks }: { stocks: Stock[] }) {
  if (stocks.length === 0) return null;
  const item = (s: Stock, i: number) => {
    const dayCh = s.prevPrice ? s.price / s.prevPrice - 1 : 0;
    const up = dayCh >= 0;
    return (
      <span key={`${s.id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", fontFamily: FONTS.heading, fontSize: 13 }}>
        <span style={{ color: C.creamSoft, fontWeight: 700, letterSpacing: 0.5 }}>{s.name.toUpperCase()}</span>
        <span style={{ color: C.brassBright }}>{kr(s.price)}</span>
        <span style={{ color: up ? C.positiveBright : C.negativeBright, fontWeight: 700 }}>
          {up ? "▲" : "▼"} {Math.abs(dayCh * 100).toFixed(1)}%
        </span>
      </span>
    );
  };
  return (
    <div className="ticker-viewport" style={{
      overflow: "hidden",
      background: "#12100a",
      border: `1px solid ${C.brass}`,
      borderRadius: 6,
      padding: "8px 0",
      boxShadow: THEME.insetGold,
    }}>
      <div className="ticker-track">
        {stocks.map(item)}
        {stocks.map((s, i) => item(s, i + stocks.length))}
      </div>
    </div>
  );
}

// ── Limitorderformulär ─────────────────────────────────────────────────

function LimitOrderForm({
  stock,
  dispatch,
  onClose,
}: {
  stock: Stock;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(100);
  const [price, setPrice] = useState(+stock.price.toFixed(2));

  const isValid = qty > 0 && price > 0;

  return (
    <div style={{ background: "#eaf0f7", border: `1px solid ${C.brass}`, borderRadius: 6, padding: 14, marginTop: 10 }}>
      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: BURGUNDY, marginBottom: 10 }}>
        Limit order – {stock.name}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            style={{
              ...secondaryBtn, flex: 1, padding: "7px 0",
              background: side === s ? BURGUNDY : "transparent",
              color: side === s ? C.brassBright : C.ink,
              border: `1px solid ${side === s ? C.brass : C.brassDim}`,
            }}
            onClick={() => setSide(s)}
          >
            {s === "buy" ? "Buy if price ≤" : "Sell if price ≥"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={subLabel}>Number of shares</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button style={stepBtn} onClick={() => setQty(Math.max(1, qty - 100))}>−</button>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(+e.target.value) || 1))} style={{ ...qtyInput, width: 80 }} />
            <button style={stepBtn} onClick={() => setQty(qty + 100)}>+</button>
          </div>
        </div>
        <div>
          <div style={subLabel}>Limit price ($)</div>
          <input type="number" min={0.01} step={0.5} value={price} onChange={(e) => setPrice(Math.max(0.01, +e.target.value))} style={{ ...qtyInput, width: 100 }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <button
            style={isValid ? primaryBtn : { ...primaryBtn, ...disabledBtn }}
            disabled={!isValid}
            onClick={() => { dispatch({ type: "PLACE_LIMIT_ORDER", stockId: stock.id, qty, limitPrice: price, side }); onClose(); }}
          >
            Place order
          </button>
          <button style={secondaryBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>
        Now: {kr(stock.price)} · The order executes automatically next month if the price reaches your target.
      </div>
    </div>
  );
}

// ── Aktiedetaljvy (feature 6, 8, 9) ─────────────────────────────────────

const TIMEFRAMES: { id: string; label: string; points: number }[] = [
  { id: "6m", label: "6 mo", points: 6 },
  { id: "1y", label: "1 yr", points: 12 },
  { id: "all", label: "Allt", points: 999 },
];

function StockDetail({ stock, state, dispatch }: { stock: Stock; state: GameState; dispatch: (a: GameAction) => void }) {
  const [qty, setQty] = useState(100);
  const [showLimit, setShowLimit] = useState(false);
  const [shortQtyInput, setShortQtyInput] = useState(100);
  const [tf, setTf] = useState("1y");
  const setQtyClamp = (v: number) => setQty(Math.max(0, Math.floor(v) || 0));

  const cost = qty * stock.price * (1 + COURTAGE);
  const canBuy = qty > 0 && state.cash >= cost;
  const sellQty = Math.min(qty, stock.owned);
  const canSell = stock.owned > 0 && qty > 0;
  const proceeds = sellQty * stock.price * (1 - COURTAGE);
  const maxAffordable = Math.floor(state.cash / (stock.price * (1 + COURTAGE)));
  const monthChange = stock.monthClose ? stock.price / stock.monthClose - 1 : 0;
  const ownShare = stock.sharesOutstanding > 0 ? stock.owned / stock.sharesOutstanding : 0;
  const marketCap = stock.price * stock.sharesOutstanding;
  const unrealized = stock.owned > 0 ? stock.owned * (stock.price - stock.avgCost) : 0;
  const pe = stock.eps && stock.eps > 0 ? Math.round((stock.price / stock.eps) * 10) / 10 : null;
  const high52 = stock.history.length > 0 ? Math.max(...stock.history) : stock.price;
  const low52 = stock.history.length > 0 ? Math.min(...stock.history) : stock.price;
  const fromHigh = (stock.price - high52) / high52;
  const isPlayerCompany = stock.competitorName === "__player__";

  const shortQty = stock.shortQty ?? 0;
  const shortPnl = shortQty > 0 && stock.shortAvgPrice ? Math.round(shortQty * (stock.shortAvgPrice - stock.price)) : 0;

  const linkedComp: Competitor | undefined = stock.competitorName && !isPlayerCompany
    ? state.competitors.find((c) => c.name === stock.competitorName)
    : undefined;
  const canAcquire = ownShare > 0.5;
  const friendly = ownShare >= 0.75;
  const premium = friendly ? 0.15 : 0.30;
  const acquireCost = (stock.sharesOutstanding - stock.owned) * stock.price * (1 + premium);

  const chartData = useMemo(() => {
    const n = TIMEFRAMES.find((t) => t.id === tf)?.points ?? 999;
    return stock.history.slice(-n);
  }, [stock.history, tf]);
  const chartChange = chartData.length > 1 ? chartData[chartData.length - 1] / chartData[0] - 1 : 0;

  const Metric = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
    <div>
      <div style={subLabel}>{label}</div>
      <div style={{ ...num, fontSize: 15, fontWeight: 700, color: color ?? C.ink }}>{value}</div>
    </div>
  );

  return (
    <div style={{ background: "#f6f2e8", border: `1px solid ${C.brass}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: 16 }}>
      {/* Graf + tidsval */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: BURGUNDY, fontSize: 14 }}>
          Kursutveckling{" "}
          <span style={{ color: trendColor(chartChange), fontSize: 13 }}>{signed(chartChange)}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              style={{
                ...secondaryBtn, padding: "4px 10px", fontSize: 11,
                background: tf === t.id ? C.wood : "transparent",
                color: tf === t.id ? C.brassBright : C.ink,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <AreaChart data={chartData} color={trendColor(chartChange)} />

      <GoldRule />

      {/* Fundamenta */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: 10 }}>
        <Metric label="Price" value={kr(stock.price)} />
        <Metric label="Month" value={signed(monthChange)} color={trendColor(monthChange)} />
        {pe !== null && <Metric label="P/E" value={`${pe}×`} color={pe < 10 ? C.green : pe > 25 ? "#b83030" : C.ink} />}
        {stock.eps !== undefined && <Metric label="EPS" value={kr(stock.eps)} />}
        {stock.targetKurs !== undefined && <Metric label="Target price" value={kr(stock.targetKurs)} color={stock.targetKurs > stock.price ? C.green : "#b83030"} />}
        <Metric label="Dividend" value={`${pct(stock.dividendYield)}/yr`} />
        <Metric label="Mktcap" value={msek(marketCap)} />
        <Metric label="52v intervall" value={<span style={{ fontSize: 12 }}>{kr(low52)}–{kr(high52)}</span>} color={fromHigh < -0.15 ? "#b83030" : C.inkSoft} />
        <Metric label="Ownership" value={pct(ownShare)} color={ownShare > 0.5 ? BURGUNDY : C.ink} />
        {stock.owned > 0 && <Metric label="Orealiserat" value={(unrealized >= 0 ? "+" : "−") + kr(Math.abs(unrealized))} color={trendColor(unrealized)} />}
      </div>

      {/* Rivalinsyn (feature 8) */}
      {linkedComp && (
        <>
          <GoldRule />
          <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: BURGUNDY, fontSize: 13, marginBottom: 8 }}>
            ⚔ Rival insight
          </div>
          <div style={{ marginBottom: 8 }}>
            <RivalCard company={linkedComp.name} showSignature />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
            <Metric label="Holdings" value={`${linkedComp.units.toLocaleString("en-US")} properties`} />
            {linkedComp.monthlyNOI !== undefined && <Metric label="NOI" value={`${kr(linkedComp.monthlyNOI)}/mo`} />}
            <Metric label="Equity" value={msek(linkedComp.equity)} />
            {linkedComp.strategy && <Metric label="Strategy" value={STRATEGY_LABEL[linkedComp.strategy] ?? linkedComp.strategy} />}
          </div>
          {linkedComp.agenda && (
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>
              🎯 Rival's goal: <span style={{ fontWeight: 700, color: C.ink }}>{linkedComp.agenda.label}</span>
            </div>
          )}
          {linkedComp.lastBuy && (
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
              Latest acquisition: {linkedComp.lastBuy}
            </div>
          )}

          {/* Uppköpsdrama (feature 9) */}
          {(canAcquire || ownShare > 0.25) && (
            <div style={{ marginTop: 10 }}>
              {canAcquire ? (
                <div style={{
                  background: friendly ? "#eef6ee" : "#fbeeee",
                  border: `1px solid ${friendly ? C.green : "#b83030"}66`,
                  borderRadius: 6, padding: 12,
                }}>
                  <div style={{ fontWeight: 700, color: friendly ? C.green : "#b83030", marginBottom: 4 }}>
                    {friendly ? "🤝 Friendly bid — the board recommends" : "⚔ Hostile bid — the board raises poison pills"}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>
                    {friendly
                      ? "With a broad majority (>75%) the board recommends your bid. Premium 15%, reputation +4."
                      : "At 50–75% you face board resistance and a bidding war. Premium 30%, reputation −3. Buy more shares for a friendly bid."}
                  </div>
                  <button
                    style={{ ...primaryBtn, width: "100%", background: friendly ? C.green : BURGUNDY }}
                    disabled={state.cash < acquireCost}
                    onClick={() => dispatch({ type: "ACQUIRE_COMPANY", stockId: stock.id })}
                  >
                    {friendly ? "Place friendly bid" : "Place hostile bid"} · remaining stake {kr(acquireCost)}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: BURGUNDY, fontWeight: 600, background: "#f4f7fb", border: `1px solid ${C.brass}66`, borderRadius: 4, padding: "6px 10px" }}>
                  {ownShare > 0.4 ? "You are approaching a majority – over 50% is needed for a bid." : "You are the largest owner – buy more to take control."}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <GoldRule />

      {/* Handelskontroller */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={stepBtn} onClick={() => setQtyClamp(qty - 100)}>−</button>
          <input type="number" min={0} value={qty} onChange={(e) => setQtyClamp(+e.target.value)} style={qtyInput} />
          <button style={stepBtn} onClick={() => setQtyClamp(qty + 100)}>+</button>
        </div>
        <button style={{ ...secondaryBtn, padding: "8px 10px" }} disabled={maxAffordable <= 0} onClick={() => setQtyClamp(maxAffordable)}>Max</button>
        <button style={canBuy ? primaryBtn : { ...primaryBtn, ...disabledBtn }} disabled={!canBuy} onClick={() => dispatch({ type: "BUY_SHARES", stockId: stock.id, qty })}>Buy</button>
        <button style={canSell ? secondaryBtn : { ...secondaryBtn, ...disabledBtn }} disabled={!canSell} onClick={() => dispatch({ type: "SELL_SHARES", stockId: stock.id, qty: sellQty })}>Sell</button>
        <button style={{ ...secondaryBtn, padding: "8px 12px", background: showLimit ? C.wood : "transparent", color: showLimit ? C.brassBright : C.ink }} onClick={() => setShowLimit((v) => !v)}>Limit</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: C.inkSoft }}>
        <span>Buy {qty.toLocaleString("en-US")}: <span style={{ ...num, color: canBuy ? C.ink : C.negative }}>{kr(cost)}</span></span>
        {stock.owned > 0 && <span>Sell {sellQty.toLocaleString("en-US")}: <span style={{ ...num, color: C.ink }}>{kr(proceeds)}</span></span>}
      </div>

      {showLimit && <LimitOrderForm stock={stock} dispatch={dispatch} onClose={() => setShowLimit(false)} />}

      {/* Blankning */}
      {!isPlayerCompany && (
        <>
          <GoldRule />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600 }}>Short selling:</span>
            {shortQty === 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button style={stepBtn} onClick={() => setShortQtyInput(Math.max(1, shortQtyInput - 100))}>−</button>
                  <input type="number" min={1} value={shortQtyInput} onChange={(e) => setShortQtyInput(Math.max(1, Math.floor(+e.target.value) || 1))} style={{ ...qtyInput, width: 72 }} />
                  <button style={stepBtn} onClick={() => setShortQtyInput(shortQtyInput + 100)}>+</button>
                </div>
                <button style={{ ...secondaryBtn, border: "1px solid #b83030", color: "#b83030" }} onClick={() => dispatch({ type: "SHORT_STOCK", stockId: stock.id, qty: shortQtyInput })}>Sell short</button>
                <span style={{ fontSize: 10, color: C.inkSoft }}>Marginal: {kr(Math.round(stock.price * shortQtyInput * 1.5))}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, color: shortPnl >= 0 ? C.green : "#b83030" }}>
                  {shortQty.toLocaleString("en-US")} shares shorted @ {stock.shortAvgPrice ? kr(stock.shortAvgPrice) : "—"}
                </span>
                <button style={{ ...primaryBtn, background: shortPnl >= 0 ? C.green : "#b83030" }} onClick={() => dispatch({ type: "COVER_SHORT", stockId: stock.id })}>
                  Cover short ({shortPnl >= 0 ? "+" : ""}{kr(shortPnl)})
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Nyhetshistorik (feature 6/7) */}
      {stock.newsHistory && stock.newsHistory.length > 0 && (
        <>
          <GoldRule />
          <div style={{ fontFamily: FONTS.heading, fontWeight: 700, color: BURGUNDY, fontSize: 13, marginBottom: 6 }}>Nyhetshistorik</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {stock.newsHistory.slice(0, 6).map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}>
                <span style={{ color: n.dir === "up" ? C.green : n.dir === "down" ? "#b83030" : C.inkSoft, fontWeight: 700, width: 14 }}>
                  {n.dir === "up" ? "▲" : n.dir === "down" ? "▼" : "•"}
                </span>
                <span style={{ color: C.inkSoft, fontFamily: FONTS.heading, whiteSpace: "nowrap" }}>{n.month}/{calYear(n.year)}</span>
                <span style={{ color: C.ink }}>{n.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Kompakt tabellrad (feature 1) ───────────────────────────────────────

function StockTableRow({ stock, state, dispatch, expanded, onToggle }: {
  stock: Stock;
  state: GameState;
  dispatch: (a: GameAction) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dayChange = stock.prevPrice ? stock.price / stock.prevPrice - 1 : 0;
  const monthChange = stock.monthClose ? stock.price / stock.monthClose - 1 : 0;
  const ownShare = stock.sharesOutstanding > 0 ? stock.owned / stock.sharesOutstanding : 0;
  const pe = stock.eps && stock.eps > 0 ? Math.round((stock.price / stock.eps) * 10) / 10 : null;
  const isNew = stock.listedYear !== undefined;
  const isRival = !!stock.competitorName && stock.competitorName !== "__player__";

  const cell: React.CSSProperties = { padding: "9px 10px", verticalAlign: "middle", borderBottom: `1px solid ${C.brassDim}33` };

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer", background: expanded ? "#efe7d4" : stock.owned > 0 ? "#f3f6f0" : "transparent" }}
      >
        <td style={{ ...cell, width: 22, textAlign: "center", color: C.brassDim }}>{expanded ? "▾" : "▸"}</td>
        <td style={cell}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SECTOR_COLOR[stock.sector], flexShrink: 0 }} />
            <span style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.ink, fontSize: 14 }}>{stock.name}</span>
            {isRival && <span title="Konkurrent" style={{ fontSize: 11 }}>⚔</span>}
            {isNew && <span style={{ fontSize: 9, fontWeight: 700, background: C.brass, color: "#1a1000", padding: "1px 5px", borderRadius: 8 }}>NEW</span>}
            {stock.owned > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: C.green, color: "#fff", padding: "1px 5px", borderRadius: 8 }}>OWNED</span>}
            {stock.analystRating && <RatingBadge rating={stock.analystRating} />}
          </div>
        </td>
        <td style={{ ...cell, textAlign: "right", ...num, fontWeight: 700, color: C.ink }}>
          <FlashCell value={stock.price} prev={stock.prevPrice}>{kr(stock.price)}</FlashCell>
        </td>
        <td style={{ ...cell, textAlign: "right", ...num, fontWeight: 700, fontSize: 12, color: trendColor(dayChange) }}>{signed(dayChange)}</td>
        <td style={{ ...cell, textAlign: "right", ...num, fontWeight: 700, fontSize: 12, color: trendColor(monthChange) }}>{signed(monthChange)}</td>
        <td style={{ ...cell, width: 96 }}><Spark data={stock.history} color={trendColor(monthChange)} /></td>
        <td style={{ ...cell, textAlign: "right", ...num, fontSize: 12, color: C.inkSoft }}>{pe !== null ? `${pe}×` : "—"}</td>
        <td style={{ ...cell, textAlign: "right", ...num, fontSize: 12, fontWeight: 700, color: ownShare > 0.5 ? BURGUNDY : C.inkSoft }}>
          {ownShare > 0 ? pct(ownShare) : "—"}
        </td>
        <td style={{ ...cell, textAlign: "right", ...num, fontSize: 12, color: C.ink }}>{stock.owned > 0 ? kr(stock.owned * stock.price) : "—"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <StockDetail stock={stock} state={state} dispatch={dispatch} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Limitorderlista ────────────────────────────────────────────────────

function LimitOrdersPanel({ orders, state, dispatch }: { orders: LimitOrder[]; state: GameState; dispatch: (a: GameAction) => void }) {
  if (orders.length === 0) return null;
  return (
    <div style={card}>
      <h3 style={{ ...heading, fontSize: 16, marginBottom: 8 }}>Open limit orders ({orders.length})</h3>
      <GoldRule />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orders.map((o) => {
          const stock = state.stocks.find((s) => s.id === o.stockId);
          const dist = stock ? (stock.price - o.limitPrice) / o.limitPrice * 100 : null;
          return (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0f4f9", border: `1px solid ${C.brassDim}44`, borderRadius: 4, padding: "8px 12px", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: C.ink }}>
                  {o.side === "buy" ? "🟢 Buy" : "🔴 Sell"} {o.qty.toLocaleString("en-US")} × {o.stockName}
                </span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  Limit price {kr(o.limitPrice)}{" · "}Now: {stock ? kr(stock.price) : "—"}
                  {dist !== null && <span style={{ color: Math.abs(dist) < 3 ? C.positive : C.inkSoft }}> ({dist > 0 ? "+" : ""}{dist.toFixed(1)} % till trigger)</span>}
                </span>
              </div>
              <button style={{ ...secondaryBtn, padding: "5px 12px", fontSize: 12 }} onClick={() => dispatch({ type: "CANCEL_LIMIT_ORDER", orderId: o.id })}>Cancel</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Aktieportföljens historik ──────────────────────────────────────────

function PortfolioHistoryCard({ history }: { history: number[] }) {
  if (!history || history.length < 2) return null;
  const latest = history[history.length - 1];
  const oldest = history[0];
  const change = oldest > 0 ? (latest - oldest) / oldest : 0;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 13, letterSpacing: 1.5, color: C.brassDim, textTransform: "uppercase", marginBottom: 4 }}>Portfolio value</div>
          <div style={{ ...num, fontSize: 24, fontWeight: 700, color: C.ink }}>{msek(latest)}</div>
          <div style={{ ...num, fontSize: 13, fontWeight: 700, color: trendColor(change), marginTop: 2 }}>{signed(change)} total ({history.length} months)</div>
        </div>
        <Spark data={history} width={200} height={44} color={trendColor(change)} />
      </div>
    </div>
  );
}

// ── Branschindex-rad ───────────────────────────────────────────────────

function SectorSummary({ stocks }: { stocks: Stock[] }) {
  const sectors = ["fastighet", "bank", "bygg", "handel", "industri"] as Sector[];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {sectors.map((sec) => {
        const sectorStocks = stocks.filter((s) => s.sector === sec);
        if (sectorStocks.length === 0) return null;
        const avgChange = sectorStocks.reduce((a, s) => a + (s.monthClose ? s.price / s.monthClose - 1 : 0), 0) / sectorStocks.length;
        return (
          <div key={sec} style={{ background: "#f0f4f9", border: `1px solid ${C.brassDim}66`, borderRadius: 4, padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SECTOR_COLOR[sec], flexShrink: 0 }} />
            <span style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.inkSoft }}>{SECTOR_LABEL[sec]}</span>
            <span style={{ ...num, fontWeight: 700, color: trendColor(avgChange) }}>{signed(avgChange)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sorterbar kolumnrubrik ──────────────────────────────────────────────

type SortKey = "namn" | "kurs" | "dag" | "manad" | "pe" | "agande" | "innehav";

function Th({ label, k, sort, setSort, align = "right" }: { label: string; k?: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; align?: "left" | "right" }) {
  const active = k && sort.key === k;
  return (
    <th
      onClick={k ? () => setSort({ key: k, dir: active && sort.dir === -1 ? 1 : -1 }) : undefined}
      style={{
        padding: "8px 10px", textAlign: align, cursor: k ? "pointer" : "default",
        fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: active ? BURGUNDY : C.inkSoft,
        fontWeight: 700, userSelect: "none", whiteSpace: "nowrap",
        borderBottom: `2px solid ${C.brassDim}66`,
      }}
    >
      {label}{active ? (sort.dir === -1 ? " ▼" : " ▲") : ""}
    </th>
  );
}

// ── Huvud-export ───────────────────────────────────────────────────────

export function StockExchange({ state, dispatch }: StockExchangeProps) {
  const [sectorFilter, setSectorFilter] = useState<Sector | "alla">("alla");
  const [typeFilter, setTypeFilter] = useState<"alla" | "rival" | "ovriga" | "innehav">("alla");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "manad", dir: -1 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const index = Math.round(state.marketSentiment * 1000);
  const sh = state.sentimentHistory ?? [];
  const prevSent = sh.length >= 2 ? sh[sh.length - 2] : state.marketSentiment;
  const indexChange = prevSent ? state.marketSentiment / prevSent - 1 : 0;

  const holdingsValue = stockHoldingsValue(state);
  const costBasis = state.stocks.reduce((a, s) => a + s.owned * s.avgCost, 0);
  const unrealized = holdingsValue - costBasis;
  const unrealizedPct = costBasis > 0 ? unrealized / costBasis : 0;

  const cyclePhase = state.marketCycle?.phase ?? "stable";
  const cycleLabel = cyclePhase === "boom" ? "📈 Boom" : cyclePhase === "bust" ? "📉 Recession" : "📊 Stable economy";

  // Filtrering + sortering
  const tradeStocks = state.stocks.filter((s) => s.id !== "FBAB");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tradeStocks.filter((s) => s.competitorName !== "__player__");
    if (sectorFilter !== "alla") list = list.filter((s) => s.sector === sectorFilter);
    if (typeFilter === "rival") list = list.filter((s) => !!s.competitorName);
    else if (typeFilter === "ovriga") list = list.filter((s) => !s.competitorName);
    else if (typeFilter === "innehav") list = list.filter((s) => s.owned > 0 || (s.shortQty ?? 0) > 0);
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    const val = (s: Stock): number | string => {
      switch (sort.key) {
        case "namn": return s.name.toLowerCase();
        case "kurs": return s.price;
        case "dag": return s.prevPrice ? s.price / s.prevPrice - 1 : 0;
        case "manad": return s.monthClose ? s.price / s.monthClose - 1 : 0;
        case "pe": return s.eps && s.eps > 0 ? s.price / s.eps : Infinity;
        case "agande": return s.sharesOutstanding > 0 ? s.owned / s.sharesOutstanding : 0;
        case "innehav": return s.owned * s.price;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" && typeof vb === "string") return va < vb ? -sort.dir : va > vb ? sort.dir : 0;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [tradeStocks, sectorFilter, typeFilter, search, sort]);

  const openOrders = state.stockOrders ?? [];
  const sectors: Array<Sector | "alla"> = ["alla", "fastighet", "bank", "bygg", "handel", "industri"];

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 4, border: `1px solid ${active ? C.brass : C.brassDim}`,
    background: active ? BURGUNDY : "transparent", color: active ? C.brassBright : C.ink,
    fontFamily: FONTS.body, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.4,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Ticker-tape (feature 4) */}
      <TickerTape stocks={tradeStocks} />

      {/* Header / index + makro */}
      <div style={{ background: THEME.woodBar, border: `2px solid ${C.brass}`, borderRadius: 6, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", boxShadow: THEME.panelShadow }}>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 900, color: C.brassBright, letterSpacing: 3, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>STOCK EXCHANGE</div>
          <div style={{ fontFamily: FONTS.heading, fontSize: 13, color: C.creamSoft }}>Stockholm Stock Exchange · {calYear(state.year)}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.creamSoft }}>{cycleLabel}</span>
            <span style={{ fontSize: 11, color: C.creamSoft }}>· Policy rate {state.interestRate.toFixed(2)}%</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Spark data={sh} width={120} height={34} color={C.brass} />
          <div style={{ textAlign: "right" }}>
            <div style={{ ...subLabel, color: C.brassDim }}>Market index</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 700, color: C.brassBright, lineHeight: 1.1 }}>{index.toLocaleString("sv-SE")}</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 14, fontWeight: 700, color: indexChange >= 0 ? C.positiveBright : C.negativeBright }}>{signed(indexChange)} vs last month</div>
          </div>
        </div>
      </div>

      <SectorSummary stocks={tradeStocks} />

      {/* Portföljsammanfattning */}
      <div style={card}>
        <h3 style={{ ...heading, fontSize: 18 }}>Your stock portfolio</h3>
        <GoldRule />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
          <div><div style={subLabel}>Holdings (market)</div><div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>{msek(holdingsValue)}</div><div style={{ fontSize: 11, color: C.inkSoft }}>{kr(holdingsValue)}</div></div>
          <div><div style={subLabel}>Cost basis</div><div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>{kr(costBasis)}</div></div>
          <div><div style={subLabel}>Orealiserat resultat</div><div style={{ ...num, fontSize: 20, fontWeight: 700, color: trendColor(unrealized) }}>{(unrealized >= 0 ? "+" : "−") + kr(Math.abs(unrealized))}</div><div style={{ ...num, fontSize: 12, fontWeight: 700, color: trendColor(unrealized) }}>{signed(unrealizedPct)}</div></div>
          <div><div style={subLabel}>Total dividends</div><div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.green }}>{kr(state.dividendsReceived)}</div></div>
        </div>
      </div>

      <PortfolioHistoryCard history={state.portfolioValueHistory ?? []} />

      {/* Ditt börsnoterade bolag (FBAB) */}
      {state.ipoActive && (() => {
        const fbab = state.stocks.find((s) => s.id === "FBAB");
        const pressure = state.takeoverPressure ?? 0;
        const pressureColor = pressure >= 75 ? "#f87a7a" : pressure >= 50 ? "#f5c842" : C.positive;
        return (
          <div style={{ ...card, border: `2px solid ${C.brass}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 17, color: BURGUNDY }}>🏛 Fastighets AB (FBAB) — Ditt bolag</div>
                <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>{(state.ipoShares?.total ?? 0).toLocaleString("sv-SE")} aktier · {(state.ipoShares?.public ?? 0).toLocaleString("sv-SE")} i publik handel</div>
              </div>
              {fbab && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...num, fontSize: 22, fontWeight: 700, color: C.ink }}>{kr(fbab.price)}</div>
                  <div style={{ fontSize: 11, color: C.inkSoft }}>
                    IPO-kurs: {state.ipoPrice ? kr(state.ipoPrice) : "—"}
                    {state.ipoPrice && fbab.price !== state.ipoPrice && (
                      <span style={{ color: fbab.price >= state.ipoPrice ? C.green : "#b83030", marginLeft: 6, fontWeight: 700 }}>
                        {fbab.price >= state.ipoPrice ? "+" : ""}{(((fbab.price / state.ipoPrice) - 1) * 100).toFixed(1)} %
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {fbab && <Spark data={fbab.history} width={300} height={40} color={C.brass} />}
            <GoldRule />
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: pressureColor }}>Takeover pressure: {Math.round(pressure)}%</span>
                <span style={{ fontSize: 11, color: C.inkSoft }}>{pressure >= 75 ? "🚨 Critical — activists are amassing shares!" : pressure >= 50 ? "⚠️ Elevated pressure" : "✅ Under control"}</span>
              </div>
              <div style={{ height: 8, background: "#2a1a0a", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pressure}%`, height: "100%", background: pressureColor, borderRadius: 4, transition: "width 0.5s" }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>Pressure rises each month. Keep reputation {">"}70 (−2/mo) and avoid market downturns to ease it.</div>
          </div>
        );
      })()}

      <LimitOrdersPanel orders={openOrders} state={state} dispatch={dispatch} />

      {/* Filter + sök */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="🔍 Search companies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...qtyInput, width: 180, height: 34, textAlign: "left", padding: "0 10px", fontFamily: FONTS.body }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["alla", "rival", "ovriga", "innehav"] as const).map((t) => (
            <button key={t} style={chip(typeFilter === t)} onClick={() => setTypeFilter(t)}>
              {t === "alla" ? "All" : t === "rival" ? "⚔ Rivals" : t === "ovriga" ? "Other companies" : "My holdings"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sectors.map((s) => (
          <button key={s} style={chip(s === sectorFilter)} onClick={() => setSectorFilter(s)}>{s === "alla" ? "Alla branscher" : SECTOR_LABEL[s]}</button>
        ))}
      </div>

      {/* Kurslista (sorterbar tabell, feature 1/2) */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <Th label="" sort={sort} setSort={setSort} align="left" />
              <Th label="Company" k="namn" sort={sort} setSort={setSort} align="left" />
              <Th label="Price" k="kurs" sort={sort} setSort={setSort} />
              <Th label="Day" k="dag" sort={sort} setSort={setSort} />
              <Th label="Month" k="manad" sort={sort} setSort={setSort} />
              <Th label="Trend" sort={sort} setSort={setSort} align="left" />
              <Th label="P/E" k="pe" sort={sort} setSort={setSort} />
              <Th label="Share" k="agande" sort={sort} setSort={setSort} />
              <Th label="Holdings" k="innehav" sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <StockTableRow
                key={s.id}
                stock={s}
                state={state}
                dispatch={dispatch}
                expanded={expandedId === s.id}
                onToggle={() => setExpandedId((id) => (id === s.id ? null : s.id))}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", color: C.inkSoft, fontSize: 14, padding: 20 }}>No companies match the filter.</div>
        )}
      </div>
    </div>
  );
}
