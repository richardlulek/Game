/* ============================================================
   Börsen – djupare aktiemarknadsvy med limitorder, nyhetshändelser
   och portföljhistorik. Inline-stilar, inga externa beroenden.
   ============================================================ */

import { useState } from "react";
import { kr, msek, pct } from "../engine/format";
import { COURTAGE, stockHoldingsValue } from "../engine/stocks";
import type { GameAction, GameState, LimitOrder, Sector, Stock } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

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
  fastighet: "Fastighet",
  bank: "Bank",
  bygg: "Bygg",
  handel: "Handel",
  industri: "Industri",
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

function GoldRule() {
  return <div style={{ height: 2, background: THEME.goldRule, margin: "10px 0" }} />;
}

const trendColor = (v: number) => (v >= 0 ? C.positive : C.negative);
const signed = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " %";

/** Sparkline. */
function Spark({
  data,
  width = 92,
  height = 26,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
      const y = height - pad - ((v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Branschchip. */
function SectorChip({ sector }: { sector: Sector }) {
  return (
    <span
      style={{
        background: SECTOR_COLOR[sector],
        color: C.creamText,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 3,
        border: `1px solid ${C.brass}88`,
        fontFamily: FONTS.body,
        whiteSpace: "nowrap",
      }}
    >
      {SECTOR_LABEL[sector]}
    </span>
  );
}

// ── Limitorderformulär ─────────────────────────────────────────────────

function LimitOrderForm({
  stock,
  currentMonth,
  dispatch,
  onClose,
}: {
  stock: Stock;
  currentMonth: number;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(100);
  const [price, setPrice] = useState(+stock.price.toFixed(2));

  const isValid = qty > 0 && price > 0;

  return (
    <div
      style={{
        background: "#eaf0f7",
        border: `1px solid ${C.brass}`,
        borderRadius: 6,
        padding: 14,
        marginTop: 10,
      }}
    >
      <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: BURGUNDY, marginBottom: 10 }}>
        Limitorder – {stock.name}
      </div>

      {/* Sida */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            style={{
              ...secondaryBtn,
              flex: 1,
              padding: "7px 0",
              background: side === s ? BURGUNDY : "transparent",
              color: side === s ? C.brassBright : C.ink,
              border: `1px solid ${side === s ? C.brass : C.brassDim}`,
            }}
            onClick={() => setSide(s)}
          >
            {s === "buy" ? "Köp om pris ≤" : "Sälj om pris ≥"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={subLabel}>Antal aktier</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button style={stepBtn} onClick={() => setQty(Math.max(1, qty - 100))}>−</button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(+e.target.value) || 1))}
              style={{ ...qtyInput, width: 80 }}
            />
            <button style={stepBtn} onClick={() => setQty(qty + 100)}>+</button>
          </div>
        </div>
        <div>
          <div style={subLabel}>Limitkurs (kr)</div>
          <input
            type="number"
            min={0.01}
            step={0.5}
            value={price}
            onChange={(e) => setPrice(Math.max(0.01, +e.target.value))}
            style={{ ...qtyInput, width: 100 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <button
            style={isValid ? primaryBtn : { ...primaryBtn, ...disabledBtn }}
            disabled={!isValid}
            onClick={() => {
              dispatch({
                type: "PLACE_LIMIT_ORDER",
                stockId: stock.id,
                qty,
                limitPrice: price,
                side,
              });
              onClose();
            }}
          >
            Lägg order
          </button>
          <button style={secondaryBtn} onClick={onClose}>
            Avbryt
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>
        Nu: {kr(stock.price)} · Order exekveras automatiskt nästa månad om kursen når ditt mål.
        Notera att kurs och tillgång kan skilja sig vid exekvering.
      </div>
    </div>
  );
}

// ── En aktierad ────────────────────────────────────────────────────────

function StockRow({
  stock,
  state,
  dispatch,
}: {
  stock: Stock;
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const [qty, setQty] = useState(100);
  const [showLimit, setShowLimit] = useState(false);
  const setQtyClamp = (v: number) => setQty(Math.max(0, Math.floor(v) || 0));

  const cost = qty * stock.price * (1 + COURTAGE);
  const canBuy = qty > 0 && state.cash >= cost;
  const canSell = stock.owned > 0 && qty > 0;
  const sellQty = Math.min(qty, stock.owned);
  const proceeds = sellQty * stock.price * (1 - COURTAGE);
  const maxAffordable = Math.floor(state.cash / (stock.price * (1 + COURTAGE)));
  const monthChange = stock.prevPrice ? stock.price / stock.prevPrice - 1 : 0;
  const ownShare = stock.sharesOutstanding > 0 ? stock.owned / stock.sharesOutstanding : 0;
  const marketCap = stock.price * stock.sharesOutstanding;
  const unrealized = stock.owned > 0 ? stock.owned * (stock.price - stock.avgCost) : 0;

  const shortQty = stock.shortQty ?? 0;
  const shortPnl = shortQty > 0 && stock.shortAvgPrice
    ? Math.round(shortQty * (stock.shortAvgPrice - stock.price))
    : 0;
  const pe = stock.eps && stock.eps > 0 ? Math.round(stock.price / stock.eps * 10) / 10 : null;
  const high52 = stock.history.length > 0 ? Math.max(...stock.history) : stock.price;
  const low52 = stock.history.length > 0 ? Math.min(...stock.history) : stock.price;
  const fromHigh = (stock.price - high52) / high52;
  const [shortQtyInput, setShortQtyInput] = useState(100);
  const isPlayerCompany = stock.competitorName === "__player__";

  const linkedComp = stock.competitorName
    ? state.competitors.find((c) => c.name === stock.competitorName)
    : undefined;
  const canAcquire = ownShare > 0.5;
  const acquireCost = (stock.sharesOutstanding - stock.owned) * stock.price * 1.2;

  return (
    <div style={{ ...card, padding: 14 }}>
      {/* Namn + chip + pris */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONTS.heading, fontSize: 17, fontWeight: 700, color: C.ink }}>
              {stock.name}
            </span>
            <SectorChip sector={stock.sector} />
            {stock.analystRating && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: stock.analystRating === "Köp" ? C.green : stock.analystRating === "Sälj" ? "#b83030" : C.wood,
                color: C.creamText,
                padding: "2px 7px", borderRadius: 10,
              }}>
                {stock.analystRating}
              </span>
            )}
            {stock.owned > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: C.green, color: "#fff",
                padding: "2px 7px", borderRadius: 10,
              }}>
                ÄGER
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft }}>
            Utdelning: <span style={num}>{pct(stock.dividendYield)}</span>/år
            {" · "}Mktcap: <span style={num}>{msek(marketCap)}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Spark data={stock.history} color={trendColor(monthChange)} />
          <div style={{ textAlign: "right" }}>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>{kr(stock.price)}</div>
            <div style={{ ...num, fontSize: 13, fontWeight: 700, color: trendColor(monthChange) }}>
              {signed(monthChange)}
            </div>
          </div>
        </div>
      </div>

      {/* Konkurrentens drift */}
      {linkedComp && (
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: C.inkSoft }}>
          <span>Bestånd: <span style={num}>{linkedComp.units.toLocaleString("sv-SE")}</span> objekt</span>
          {linkedComp.monthlyNOI !== undefined && (
            <span>Driftnetto: <span style={num}>{kr(linkedComp.monthlyNOI)}</span>/mån</span>
          )}
        </div>
      )}

      <GoldRule />

      {/* Innehav + P&L */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 4 }}>
        <div>
          <div style={subLabel}>Ditt innehav</div>
          <div style={{ ...num, fontSize: 15, color: C.ink, fontWeight: 700 }}>
            {stock.owned.toLocaleString("sv-SE")} st
          </div>
        </div>
        <div>
          <div style={subLabel}>Marknadsvärde</div>
          <div style={{ ...num, fontSize: 15, color: C.ink, fontWeight: 700 }}>
            {kr(stock.owned * stock.price)}
          </div>
        </div>
        {stock.owned > 0 && (
          <div>
            <div style={subLabel}>Orealiserat</div>
            <div style={{ ...num, fontSize: 15, fontWeight: 700, color: trendColor(unrealized) }}>
              {(unrealized >= 0 ? "+" : "−") + kr(Math.abs(unrealized))}
            </div>
          </div>
        )}
        <div>
          <div style={subLabel}>Ägarandel</div>
          <div style={{ ...num, fontSize: 15, fontWeight: 700, color: ownShare > 0.5 ? BURGUNDY : C.ink }}>
            {pct(ownShare)}
          </div>
        </div>
        {pe !== null && (
          <div>
            <div style={subLabel}>P/E-tal</div>
            <div style={{ ...num, fontSize: 15, fontWeight: 700, color: pe < 10 ? C.green : pe > 25 ? "#b83030" : C.ink }}>
              {pe}×
            </div>
          </div>
        )}
        <div>
          <div style={subLabel}>52v Intervall</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
            {kr(low52)} – {kr(high52)}
          </div>
          <div style={{ fontSize: 10, color: fromHigh < -0.15 ? "#b83030" : C.inkSoft }}>
            {((stock.price - high52) / high52 * 100).toFixed(0)} % från topp
          </div>
        </div>
        {shortQty > 0 && (
          <div>
            <div style={subLabel}>Blankat</div>
            <div style={{ ...num, fontSize: 15, fontWeight: 700, color: shortPnl >= 0 ? C.green : "#b83030" }}>
              {shortQty.toLocaleString("sv-SE")} st
            </div>
            <div style={{ ...num, fontSize: 12, fontWeight: 700, color: shortPnl >= 0 ? C.green : "#b83030" }}>
              {shortPnl >= 0 ? "+" : ""}{kr(shortPnl)}
            </div>
          </div>
        )}
      </div>

      {/* Förvärvsknapp / hint */}
      {stock.competitorName && (canAcquire || ownShare > 0.25) && (
        <div style={{ marginTop: 10 }}>
          {canAcquire ? (
            <>
              <button
                style={{ ...primaryBtn, width: "100%" }}
                onClick={() => dispatch({ type: "ACQUIRE_COMPANY", stockId: stock.id })}
              >
                Förvärva bolaget
              </button>
              <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 5, textAlign: "center" }}>
                Restpost (ca +20 %): <span style={num}>{kr(acquireCost)}</span>
              </div>
            </>
          ) : (
            <div style={{
              fontSize: 12, color: BURGUNDY, fontWeight: 600,
              background: "#f4f7fb", border: `1px solid ${C.brass}66`,
              borderRadius: 4, padding: "6px 10px",
            }}>
              {ownShare > 0.4
                ? "Du närmar dig majoritet – över 50 % krävs för förvärv."
                : "Du är störste ägare – köp mer för att ta kontroll."}
            </div>
          )}
        </div>
      )}

      <GoldRule />

      {/* Handelskontroller */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={stepBtn} onClick={() => setQtyClamp(qty - 100)}>−</button>
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQtyClamp(+e.target.value)}
            style={qtyInput}
          />
          <button style={stepBtn} onClick={() => setQtyClamp(qty + 100)}>+</button>
        </div>
        <button
          style={{ ...secondaryBtn, padding: "8px 10px" }}
          disabled={maxAffordable <= 0}
          onClick={() => setQtyClamp(maxAffordable)}
        >
          Max
        </button>
        <button
          style={canBuy ? primaryBtn : { ...primaryBtn, ...disabledBtn }}
          disabled={!canBuy}
          onClick={() => dispatch({ type: "BUY_SHARES", stockId: stock.id, qty })}
        >
          Köp
        </button>
        <button
          style={canSell ? secondaryBtn : { ...secondaryBtn, ...disabledBtn }}
          disabled={!canSell}
          onClick={() => dispatch({ type: "SELL_SHARES", stockId: stock.id, qty: sellQty })}
        >
          Sälj
        </button>
        <button
          style={{
            ...secondaryBtn,
            padding: "8px 12px",
            background: showLimit ? C.wood : "transparent",
            color: showLimit ? C.brassBright : C.ink,
          }}
          onClick={() => setShowLimit((v) => !v)}
        >
          Limit
        </button>
      </div>

      {/* Kostnads-/likvidförhandsvisning */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: C.inkSoft }}>
        <span>
          Köp {qty.toLocaleString("sv-SE")} st:{" "}
          <span style={{ ...num, color: canBuy ? C.ink : C.negative }}>{kr(cost)}</span>
        </span>
        {stock.owned > 0 && (
          <span>
            Sälj {sellQty.toLocaleString("sv-SE")} st:{" "}
            <span style={{ ...num, color: C.ink }}>{kr(proceeds)}</span>
          </span>
        )}
      </div>

      {/* Limitorderformulär */}
      {showLimit && (
        <LimitOrderForm
          stock={stock}
          currentMonth={state.month}
          dispatch={dispatch}
          onClose={() => setShowLimit(false)}
        />
      )}

      {/* Blankning */}
      {!isPlayerCompany && (
        <>
          <GoldRule />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600 }}>Blankning:</span>
            {shortQty === 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button style={stepBtn} onClick={() => setShortQtyInput(Math.max(1, shortQtyInput - 100))}>−</button>
                  <input
                    type="number"
                    min={1}
                    value={shortQtyInput}
                    onChange={(e) => setShortQtyInput(Math.max(1, Math.floor(+e.target.value) || 1))}
                    style={{ ...qtyInput, width: 72 }}
                  />
                  <button style={stepBtn} onClick={() => setShortQtyInput(shortQtyInput + 100)}>+</button>
                </div>
                <button
                  style={{ ...secondaryBtn, border: "1px solid #b83030", color: "#b83030" }}
                  onClick={() => dispatch({ type: "SHORT_STOCK", stockId: stock.id, qty: shortQtyInput })}
                >
                  Sälj blankt
                </button>
                <span style={{ fontSize: 10, color: C.inkSoft }}>
                  Marginal: {kr(Math.round(stock.price * shortQtyInput * 1.5))}
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, color: shortPnl >= 0 ? C.green : "#b83030" }}>
                  {shortQty.toLocaleString("sv-SE")} aktier blankade @ {stock.shortAvgPrice ? kr(stock.shortAvgPrice) : "—"}
                </span>
                <button
                  style={{ ...primaryBtn, background: shortPnl >= 0 ? C.green : "#b83030" }}
                  onClick={() => dispatch({ type: "COVER_SHORT", stockId: stock.id })}
                >
                  Täck blankning ({shortPnl >= 0 ? "+" : ""}{kr(shortPnl)})
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Limitorderlista ────────────────────────────────────────────────────

function LimitOrdersPanel({
  orders,
  state,
  dispatch,
}: {
  orders: LimitOrder[];
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <div style={card}>
      <h3 style={{ ...heading, fontSize: 16, marginBottom: 8 }}>
        Öppna limitorder ({orders.length})
      </h3>
      <GoldRule />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orders.map((o) => {
          const stock = state.stocks.find((s) => s.id === o.stockId);
          const dist = stock ? ((stock.price - o.limitPrice) / o.limitPrice * 100) : null;
          return (
            <div
              key={o.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f0f4f9",
                border: `1px solid ${C.brassDim}44`,
                borderRadius: 4,
                padding: "8px 12px",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: C.ink }}>
                  {o.side === "buy" ? "🟢 Köp" : "🔴 Sälj"} {o.qty.toLocaleString("sv-SE")} × {o.stockName}
                </span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  Limitkurs {kr(o.limitPrice)}
                  {" · "}Nu: {stock ? kr(stock.price) : "—"}
                  {dist !== null && (
                    <span style={{ color: Math.abs(dist) < 3 ? C.positive : C.inkSoft }}>
                      {" "}({dist > 0 ? "+" : ""}{dist.toFixed(1)} % till trigger)
                    </span>
                  )}
                </span>
              </div>
              <button
                style={{ ...secondaryBtn, padding: "5px 12px", fontSize: 12 }}
                onClick={() => dispatch({ type: "CANCEL_LIMIT_ORDER", orderId: o.id })}
              >
                Avbryt
              </button>
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
          <div style={{ fontFamily: FONTS.display, fontSize: 13, letterSpacing: 1.5, color: C.brassDim, textTransform: "uppercase", marginBottom: 4 }}>
            Portföljens värde
          </div>
          <div style={{ ...num, fontSize: 24, fontWeight: 700, color: C.ink }}>{msek(latest)}</div>
          <div style={{ ...num, fontSize: 13, fontWeight: 700, color: trendColor(change), marginTop: 2 }}>
            {signed(change)} totalt ({history.length} månader)
          </div>
        </div>
        <Spark data={history} width={200} height={44} color={trendColor(change)} />
      </div>
    </div>
  );
}

// ── Branschindex-rad ───────────────────────────────────────────────────

function SectorSummary({ stocks }: { stocks: Stock[] }) {
  const sectors = (["fastighet", "bank", "bygg", "handel", "industri"] as Sector[]);
  return (
    <div style={{
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
    }}>
      {sectors.map((sec) => {
        const sectorStocks = stocks.filter((s) => s.sector === sec);
        if (sectorStocks.length === 0) return null;
        const avgChange = sectorStocks.reduce((a, s) => a + (s.prevPrice ? s.price / s.prevPrice - 1 : 0), 0) / sectorStocks.length;
        return (
          <div
            key={sec}
            style={{
              background: "#f0f4f9",
              border: `1px solid ${C.brassDim}66`,
              borderRadius: 4,
              padding: "6px 12px",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: SECTOR_COLOR[sec],
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: FONTS.heading, fontWeight: 700, color: C.inkSoft }}>
              {SECTOR_LABEL[sec]}
            </span>
            <span style={{ ...num, fontWeight: 700, color: trendColor(avgChange) }}>
              {signed(avgChange)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Huvud-export ───────────────────────────────────────────────────────

export function StockExchange({ state, dispatch }: StockExchangeProps) {
  const [sectorFilter, setSectorFilter] = useState<Sector | "alla">("alla");

  // ── Marknadsindex ──────────────────────────────────────────
  const index = Math.round(state.marketSentiment * 1000);
  const sh = state.sentimentHistory ?? [];
  const prevSent = sh.length >= 2 ? sh[sh.length - 2] : state.marketSentiment;
  const indexChange = prevSent ? state.marketSentiment / prevSent - 1 : 0;

  // ── Innehavssammanställning ────────────────────────────────
  const holdingsValue = stockHoldingsValue(state);
  const costBasis = state.stocks.reduce((a, s) => a + s.owned * s.avgCost, 0);
  const unrealized = holdingsValue - costBasis;
  const unrealizedPct = costBasis > 0 ? unrealized / costBasis : 0;

  // ── Filtrering ──────────────────────────────────────────────
  const competitorStocks = state.stocks.filter(
    (s) => s.competitorName && s.competitorName !== "__player__" && (sectorFilter === "alla" || s.sector === sectorFilter),
  );
  const otherStocks = state.stocks.filter(
    (s) => !s.competitorName && (sectorFilter === "alla" || s.sector === sectorFilter),
  );

  const openOrders = state.stockOrders ?? [];

  const sectors: Array<Sector | "alla"> = ["alla", "fastighet", "bank", "bygg", "handel", "industri"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header / index ──────────────────────────────────── */}
      <div style={{
        background: THEME.woodBar,
        border: `2px solid ${C.brass}`,
        borderRadius: 6,
        padding: "14px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        boxShadow: THEME.panelShadow,
      }}>
        <div>
          <div style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 900,
            color: C.brassBright,
            letterSpacing: 3,
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}>
            BÖRSEN
          </div>
          <div style={{ fontFamily: FONTS.heading, fontSize: 13, color: C.creamSoft }}>
            Stockholms Fondbörs · {state.year}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Spark data={sh} width={120} height={34} color={C.brass} />
          <div style={{ textAlign: "right" }}>
            <div style={{ ...subLabel, color: C.brassDim }}>Marknadsindex</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 700, color: C.brassBright, lineHeight: 1.1 }}>
              {index.toLocaleString("sv-SE")}
            </div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 14, fontWeight: 700, color: indexChange >= 0 ? C.positiveBright : C.negativeBright }}>
              {signed(indexChange)} mot förra månaden
            </div>
          </div>
        </div>
      </div>

      {/* ── Branschindex ────────────────────────────────────── */}
      <SectorSummary stocks={state.stocks} />

      {/* ── Innehavssammanställning ─────────────────────────── */}
      <div style={card}>
        <h3 style={{ ...heading, fontSize: 18 }}>Din aktieportfölj</h3>
        <GoldRule />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
          <div>
            <div style={subLabel}>Innehav (marknad)</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>{msek(holdingsValue)}</div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>{kr(holdingsValue)}</div>
          </div>
          <div>
            <div style={subLabel}>Anskaffningsvärde</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>{kr(costBasis)}</div>
          </div>
          <div>
            <div style={subLabel}>Orealiserat resultat</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: trendColor(unrealized) }}>
              {(unrealized >= 0 ? "+" : "−") + kr(Math.abs(unrealized))}
            </div>
            <div style={{ ...num, fontSize: 12, fontWeight: 700, color: trendColor(unrealized) }}>
              {signed(unrealizedPct)}
            </div>
          </div>
          <div>
            <div style={subLabel}>Utdelningar totalt</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.green }}>
              {kr(state.dividendsReceived)}
            </div>
          </div>
          <div>
            <div style={subLabel}>Total avkastning</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: trendColor(unrealizedPct) }}>
              {signed(unrealizedPct)}
            </div>
            {costBasis > 0 && (
              <div style={{ fontSize: 11, color: C.inkSoft }}>på {kr(costBasis)} invest.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Portföljhistorik ─────────────────────────────────── */}
      <PortfolioHistoryCard history={state.portfolioValueHistory ?? []} />

      {/* ── Ditt börsnoterade bolag (FBAB) ─────────────────────── */}
      {state.ipoActive && (() => {
        const fbab = state.stocks.find((s) => s.id === "FBAB");
        const pressure = state.takeoverPressure ?? 0;
        const pressureColor = pressure >= 75 ? "#f87a7a" : pressure >= 50 ? "#f5c842" : C.positive;
        return (
          <div style={{ ...card, border: `2px solid ${C.brass}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 17, color: BURGUNDY }}>
                  🏛 Fastighets AB (FBAB) — Ditt bolag
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
                  {(state.ipoShares?.total ?? 0).toLocaleString("sv-SE")} aktier ·{" "}
                  {(state.ipoShares?.public ?? 0).toLocaleString("sv-SE")} i publik handel
                </div>
              </div>
              {fbab && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...num, fontSize: 22, fontWeight: 700, color: C.ink }}>
                    {kr(fbab.price)}
                  </div>
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
                <span style={{ fontSize: 12, fontWeight: 700, color: pressureColor }}>
                  Uppköpstryck: {Math.round(pressure)} %
                </span>
                <span style={{ fontSize: 11, color: C.inkSoft }}>
                  {pressure >= 75 ? "🚨 Kritiskt — aktivister samlar aktier!" : pressure >= 50 ? "⚠️ Förhöjt tryck" : "✅ Under kontroll"}
                </span>
              </div>
              <div style={{ height: 8, background: "#2a1a0a", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pressure}%`, height: "100%", background: pressureColor, borderRadius: 4, transition: "width 0.5s" }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>
              Trycket ökar varje månad. Håll reputation {">"}70 (−2/mån) och undvik börsnedgångar för att dämpa det.
            </div>
          </div>
        );
      })()}

      {/* ── Öppna limitorder ─────────────────────────────────── */}
      <LimitOrdersPanel orders={openOrders} state={state} dispatch={dispatch} />

      {/* ── Branschfilter ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sectors.map((s) => (
          <button
            key={s}
            style={{
              padding: "6px 14px",
              borderRadius: 4,
              border: `1px solid ${s === sectorFilter ? C.brass : C.brassDim}`,
              background: s === sectorFilter ? BURGUNDY : "transparent",
              color: s === sectorFilter ? C.brassBright : C.ink,
              fontFamily: FONTS.body,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              letterSpacing: 0.4,
            }}
            onClick={() => setSectorFilter(s)}
          >
            {s === "alla" ? "Alla" : SECTOR_LABEL[s]}
          </button>
        ))}
      </div>

      {/* ── Konkurrenter ────────────────────────────────────── */}
      {competitorStocks.length > 0 && (
        <div>
          <h3 style={{ ...heading, color: C.brassBright, fontSize: 18, marginBottom: 10 }}>
            Konkurrenter
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {competitorStocks.map((s) => (
              <StockRow key={s.id} stock={s} state={state} dispatch={dispatch} />
            ))}
          </div>
        </div>
      )}

      {/* ── Övriga bolag ────────────────────────────────────── */}
      {otherStocks.length > 0 && (
        <div>
          <h3 style={{ ...heading, color: C.brassBright, fontSize: 18, marginBottom: 10 }}>
            Övriga bolag
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {otherStocks.map((s) => (
              <StockRow key={s.id} stock={s} state={state} dispatch={dispatch} />
            ))}
          </div>
        </div>
      )}

      {competitorStocks.length === 0 && otherStocks.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: C.inkSoft, fontSize: 14 }}>
          Inga bolag matchar valt branschfilter.
        </div>
      )}
    </div>
  );
}
