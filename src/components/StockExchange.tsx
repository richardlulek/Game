/* ============================================================
   Börsen – art-deco aktiemarknadsvy.
   Handlar mot den redan byggda börsmotorn (engine/stocks).
   Inline-stilar, inga externa beroenden utöver designtokens.
   ============================================================ */

import { useState } from "react";
import { kr, msek, pct } from "../engine/format";
import { COURTAGE, stockHoldingsValue } from "../engine/stocks";
import type { GameAction, GameState, Sector, Stock } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

interface StockExchangeProps {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

/** Branschfärger för chip. */
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

/** Tunn guldlinje – avdelare. */
function GoldRule() {
  return <div style={{ height: 2, background: THEME.goldRule, margin: "10px 0" }} />;
}

/** Färg för upp/ned-tal. */
const trendColor = (v: number) => (v >= 0 ? C.positive : C.negative);
const signed = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " %";

/** Liten inline-SVG-sparkline. */
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
  if (!data || data.length < 2) {
    return <div style={{ width, height }} />;
  }
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
  color: "#e8e0d0",
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
  background: "#fbf5e6",
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

export function StockExchange({ state, dispatch }: StockExchangeProps) {
  // Per-aktie antal i lokalt state (default 100).
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const qtyOf = (id: string) => {
    const q = qtys[id];
    return q === undefined ? 100 : q;
  };
  const setQty = (id: string, v: number) =>
    setQtys((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(v) || 0) }));

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

  const competitorStocks = state.stocks.filter((s) => s.competitorName);
  const otherStocks = state.stocks.filter((s) => !s.competitorName);

  // ── En aktierad ────────────────────────────────────────────
  function StockRow({ stock }: { stock: Stock }) {
    const qty = qtyOf(stock.id);
    const cost = qty * stock.price * (1 + COURTAGE);
    const canBuy = qty > 0 && state.cash >= cost;
    const canSell = stock.owned > 0 && qty > 0;
    const sellable = Math.min(qty, stock.owned);
    const proceeds = sellable * stock.price * (1 - COURTAGE);
    const maxAffordable = Math.floor(state.cash / (stock.price * (1 + COURTAGE)));
    const monthChange = stock.prevPrice ? stock.price / stock.prevPrice - 1 : 0;
    const ownShare = stock.sharesOutstanding > 0 ? stock.owned / stock.sharesOutstanding : 0;

    const linkedComp = stock.competitorName
      ? state.competitors.find((c) => c.name === stock.competitorName)
      : undefined;

    const canAcquire = ownShare > 0.5;
    const acquireCost = (stock.sharesOutstanding - stock.owned) * stock.price * 1.2;

    return (
      <div style={{ ...card, padding: 14 }}>
        {/* Översta raden: namn + chip + pris */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: FONTS.heading,
                  fontSize: 17,
                  fontWeight: 700,
                  color: C.ink,
                }}
              >
                {stock.name}
              </span>
              <SectorChip sector={stock.sector} />
            </div>
            <div style={{ fontSize: 12, color: C.inkSoft }}>
              Utdelning: <span style={num}>{pct(stock.dividendYield)}</span> /år
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Spark data={stock.history} color={trendColor(monthChange)} />
            <div style={{ textAlign: "right" }}>
              <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>
                {kr(stock.price)}
              </div>
              <div style={{ ...num, fontSize: 13, fontWeight: 700, color: trendColor(monthChange) }}>
                {signed(monthChange)}
              </div>
            </div>
          </div>
        </div>

        {/* Konkurrentens drift (objekt + NOI) */}
        {linkedComp && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 8,
              fontSize: 12,
              color: C.inkSoft,
            }}
          >
            <span>
              Bestånd: <span style={num}>{linkedComp.units.toLocaleString("sv-SE")}</span> objekt
            </span>
            {linkedComp.monthlyNOI !== undefined && (
              <span>
                Driftnetto: <span style={num}>{kr(linkedComp.monthlyNOI)}</span>/mån
              </span>
            )}
          </div>
        )}

        <GoldRule />

        {/* Innehav */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div>
            <div style={subLabel}>Ditt innehav</div>
            <div style={{ ...num, fontSize: 15, color: C.ink, fontWeight: 700 }}>
              {stock.owned.toLocaleString("sv-SE")} st
            </div>
          </div>
          <div>
            <div style={subLabel}>Värde</div>
            <div style={{ ...num, fontSize: 15, color: C.ink, fontWeight: 700 }}>
              {kr(stock.owned * stock.price)}
            </div>
          </div>
          <div>
            <div style={subLabel}>Ägarandel</div>
            <div
              style={{
                ...num,
                fontSize: 15,
                fontWeight: 700,
                color: ownShare > 0.5 ? BURGUNDY : C.ink,
              }}
            >
              {pct(ownShare)}
            </div>
          </div>
        </div>

        {/* Takeover-hint / knapp för konkurrenter */}
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
              <div
                style={{
                  fontSize: 12,
                  color: BURGUNDY,
                  fontWeight: 600,
                  background: "#fff7ea",
                  border: `1px solid ${C.brass}66`,
                  borderRadius: 4,
                  padding: "6px 10px",
                }}
              >
                {ownShare > 0.4
                  ? "Du närmar dig majoritet – över 50 % krävs för förvärv."
                  : "Du är största ägare i bolaget."}
              </div>
            )}
          </div>
        )}

        <GoldRule />

        {/* Handelskontroller */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button style={stepBtn} aria-label="Minska" onClick={() => setQty(stock.id, qty - 100)}>
              −
            </button>
            <input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(stock.id, +e.target.value)}
              style={qtyInput}
            />
            <button style={stepBtn} aria-label="Öka" onClick={() => setQty(stock.id, qty + 100)}>
              +
            </button>
          </div>
          <button
            style={{ ...secondaryBtn, padding: "8px 10px" }}
            disabled={maxAffordable <= 0}
            onClick={() => setQty(stock.id, maxAffordable)}
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
            onClick={() => dispatch({ type: "SELL_SHARES", stockId: stock.id, qty: sellable })}
          >
            Sälj
          </button>
        </div>

        {/* Kostnads-/likvidförhandsvisning */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontSize: 12,
            color: C.inkSoft,
          }}
        >
          <span>
            Kostnad köp: <span style={{ ...num, color: canBuy ? C.ink : C.negative }}>{kr(cost)}</span>
          </span>
          {stock.owned > 0 && (
            <span>
              Likvid sälj ({sellable.toLocaleString("sv-SE")} st):{" "}
              <span style={{ ...num, color: C.ink }}>{kr(proceeds)}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Header / index ──────────────────────────────────── */}
      <div
        style={{
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
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 26,
              fontWeight: 900,
              color: C.brassBright,
              letterSpacing: 3,
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
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
            <div
              style={{
                fontFamily: FONTS.heading,
                fontSize: 28,
                fontWeight: 700,
                color: C.brassBright,
                lineHeight: 1.1,
              }}
            >
              {index.toLocaleString("sv-SE")}
            </div>
            <div
              style={{
                fontFamily: FONTS.heading,
                fontSize: 14,
                fontWeight: 700,
                color: indexChange >= 0 ? C.positiveBright : C.negativeBright,
              }}
            >
              {signed(indexChange)} mot förra månaden
            </div>
          </div>
        </div>
      </div>

      {/* ── Innehavssammanställning ─────────────────────────── */}
      <div style={card}>
        <h3 style={{ ...heading, fontSize: 18 }}>Din aktieportfölj</h3>
        <GoldRule />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: 14,
          }}
        >
          <div>
            <div style={subLabel}>Innehav (marknad)</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>
              {msek(holdingsValue)}
            </div>
            <div style={{ fontSize: 11, color: C.inkSoft }}>{kr(holdingsValue)}</div>
          </div>
          <div>
            <div style={subLabel}>Anskaffningsvärde</div>
            <div style={{ ...num, fontSize: 20, fontWeight: 700, color: C.ink }}>
              {kr(costBasis)}
            </div>
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
        </div>
      </div>

      {/* ── Konkurrenter ────────────────────────────────────── */}
      {competitorStocks.length > 0 && (
        <div>
          <h3 style={{ ...heading, color: C.brassBright, fontSize: 18, marginBottom: 10 }}>
            Konkurrenter
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {competitorStocks.map((s) => (
              <StockRow key={s.id} stock={s} />
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
              <StockRow key={s.id} stock={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
