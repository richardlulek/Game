/* ============================================================
   Koncern – art-deco översikt över holdingstrukturen.
   Förmögenhetsfördelning, dotterbolag, ägarandelar i rivaler,
   och nyckeltal. Läser endast tillstånd, dispatchar inget.
   ============================================================ */

import { useState } from "react";
import { kr, msek, pct } from "../engine/format";
import { equityOf, loanTerms, portfolioValue } from "../engine/finance";
import { propNOI } from "../engine/property";
import { STOCK_CAP_RATE, stockHoldingsValue, subsidiaryValue } from "../engine/stocks";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

interface GroupOverviewProps {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

const card: React.CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 6,
  padding: 18,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 6px 18px rgba(0,0,0,0.35)`,
};

const heading: React.CSSProperties = {
  fontFamily: FONTS.heading,
  fontSize: 18,
  fontWeight: 700,
  color: BURGUNDY,
  margin: 0,
};

const num: React.CSSProperties = { fontFamily: FONTS.heading };

const subLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: C.inkSoft,
  fontWeight: 600,
};

function GoldRule() {
  return <div style={{ height: 2, background: THEME.goldRule, margin: "10px 0" }} />;
}

/** En rad i fördelnings-/nyckeltalslistan. */
function Row({
  label,
  value,
  accent,
  bold,
  swatch,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
  swatch?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "5px 0",
        fontSize: 14,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: C.inkSoft,
          fontWeight: bold ? 700 : 500,
        }}
      >
        {swatch && (
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background: swatch,
              border: `1px solid ${C.brass}88`,
              flexShrink: 0,
            }}
          />
        )}
        {label}
      </span>
      <span style={{ ...num, fontWeight: bold ? 800 : 700, color: accent || C.ink }}>{value}</span>
    </div>
  );
}

const sellBtnStyle: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 4,
  border: `1px solid ${C.brassDim}`,
  background: "transparent",
  color: C.ink,
  fontWeight: 600,
  fontSize: 12,
  fontFamily: FONTS.body,
  cursor: "pointer",
};

export function GroupOverview({ state, dispatch }: GroupOverviewProps) {
  const cash = state.cash;
  const propVal = portfolioValue(state);
  const stocksVal = stockHoldingsValue(state);
  const subsVal = subsidiaryValue(state);
  const equity = equityOf(state);

  // Stapelsegment över de positiva komponenterna.
  const segments = [
    { label: "Cash", value: cash, color: C.brass },
    { label: "Properties", value: propVal, color: C.green },
    { label: "Shares", value: stocksVal, color: BURGUNDY },
    { label: "Subsidiaries", value: subsVal, color: C.gold },
  ];
  const positiveTotal = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;

  // ── Nyckeltal: månadens kassaflöde ─────────────────────────
  const monthlyNOI = state.portfolio.reduce((a, p) => a + propNOI(p, state), 0) / 12;
  const monthlyInterest = (state.debt * (loanTerms(state).rate / 100)) / 12;
  const monthlyDividends =
    state.stocks.reduce((a, s) => a + s.owned * s.price * s.dividendYield, 0) / 12;
  const monthlySubs = state.subsidiaries.reduce((a, s) => a + s.monthlyIncome, 0);
  const monthlyCashflow = monthlyNOI - monthlyInterest + monthlyDividends + monthlySubs;

  const rivalStakes = state.stocks.filter((s) => s.competitorName && s.owned > 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {/* ── Förmögenhetsfördelning ────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Wealth breakdown</h3>
        <GoldRule />

        {/* Stackad horisontell stapel */}
        <div
          style={{
            display: "flex",
            height: 22,
            borderRadius: 4,
            overflow: "hidden",
            border: `1px solid ${C.brassDim}`,
            marginBottom: 14,
            background: "#d8c7a0",
          }}
        >
          {segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                title={`${s.label}: ${kr(s.value)}`}
                style={{
                  width: `${(Math.max(0, s.value) / positiveTotal) * 100}%`,
                  background: s.color,
                }}
              />
            ) : null,
          )}
        </div>

        <Row label="Cash" value={kr(cash)} swatch={C.brass} />
        <Row label="Properties" value={kr(propVal)} swatch={C.green} />
        <Row label="Share holdings" value={kr(stocksVal)} swatch={BURGUNDY} />
        <Row label="Subsidiaries" value={kr(subsVal)} swatch={C.gold} />
        <Row label="Debt" value={"−" + kr(state.debt)} accent={C.negative} />
        <GoldRule />
        <Row label="Equity" value={kr(equity)} accent={BURGUNDY} bold />
      </div>

      {/* ── Nyckeltal ─────────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Key figures</h3>
        <GoldRule />
        <Row label="Equity" value={msek(equity)} accent={BURGUNDY} bold />
        <Row
          label="Monthly cash flow"
          value={kr(monthlyCashflow)}
          accent={monthlyCashflow >= 0 ? C.positive : C.negative}
        />
        <Row label="Reputation" value={`${Math.round(state.reputation)} / 100`} />
        <Row label="Number of properties" value={state.portfolio.length.toLocaleString("en-US")} />
        <Row
          label="Number of share lots"
          value={state.stocks
            .filter((s) => s.owned > 0)
            .length.toLocaleString("en-US")}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: C.inkSoft }}>
          Cash flow = net operating income − interest + dividends + subsidiaries (per month).
        </div>
      </div>

      {/* ── Dotterbolag ───────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Subsidiaries</h3>
        <GoldRule />
        {state.subsidiaries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {state.subsidiaries.map((s, i) => {
              const salePrice = Math.round((s.monthlyIncome * 12 / STOCK_CAP_RATE) * 0.80);
              return (
                <div
                  key={s.name + i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom:
                      i < state.subsidiaries.length - 1
                        ? "1px solid rgba(201,164,92,0.3)"
                        : "none",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: FONTS.heading, fontSize: 15, color: C.ink }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: 11, color: C.inkSoft }}>
                      Sale value ~{msek(salePrice)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ ...num, fontWeight: 700, color: C.green, whiteSpace: "nowrap" }}>
                      {kr(s.monthlyIncome)}/mo
                    </span>
                    <button
                      style={sellBtnStyle}
                      onClick={() => dispatch({ type: "SELL_SUBSIDIARY", name: s.name })}
                    >
                      Sell
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>
              Sale price = capitalized cash flow (6% yield) with a 20% liquidation discount.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
            No subsidiaries. Acquired competitors are merged into the group —
            their properties and cash are added directly instead of sitting in a shell company.
          </div>
        )}
      </div>

      {/* ── Ägarandelar i rivaler ─────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Stakes in rivals</h3>
        <GoldRule />
        {rivalStakes.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rivalStakes.map((s, i) => {
              const share = s.sharesOutstanding > 0 ? s.owned / s.sharesOutstanding : 0;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom:
                      i < rivalStakes.length - 1 ? "1px solid rgba(201,164,92,0.3)" : "none",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: FONTS.heading, fontSize: 15, color: C.ink }}>
                      {s.name}
                    </span>
                    <span style={subLabel}>Ownership {pct(share)}</span>
                  </div>
                  <span
                    style={{
                      ...num,
                      fontWeight: 700,
                      color: share > 0.5 ? BURGUNDY : C.ink,
                    }}
                  >
                    {kr(s.owned * s.price)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
            You don't own any shares in competitors yet. Buy shares on the Stock Exchange to build influence.
          </div>
        )}
      </div>

      {/* ── IPO & ägarstruktur ── */}
      <div style={{ ...card, marginTop: 20 }}>
        <h3 style={heading}>Stock listing (IPO)</h3>
        <GoldRule />
        {state.ipoActive ? (
          <OwnershipSection state={state} dispatch={dispatch} />
        ) : (
          <IpoSection state={state} dispatch={dispatch} />
        )}
      </div>
    </div>
  );
}

/** Noteringsval: hur stor andel av bolaget säljs till marknaden?
 *  Liten float skyddar kontrollen, stor float maximerar likviden men
 *  släpper in aktivistfonden på riktigt. */
function IpoSection({ state, dispatch }: GroupOverviewProps) {
  const [float, setFloat] = useState(0.3);
  const eq = equityOf(state);
  const portVal = state.portfolio.reduce((a, p) => a + p.askPrice, 0);
  const raised = Math.round(eq * float * 0.96);
  const ok = portVal >= 5_000_000 && raised >= 1_000_000 && !state.gameOver;
  return (
    <>
      <Row label="Status" value="Not listed" />
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: C.inkSoft, margin: "10px 0 4px", fontWeight: 700 }}>
        FREE FLOAT — SHARE OF THE COMPANY SOLD TO THE MARKET
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {[0.2, 0.3, 0.49, 0.65].map((f) => (
          <button
            key={f}
            onClick={() => setFloat(f)}
            style={{
              padding: "6px 12px", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: `1px solid ${float === f ? BURGUNDY : C.brass}`,
              background: float === f ? BURGUNDY : "transparent",
              color: float === f ? C.brassBright : C.ink,
            }}
          >
            {Math.round(f * 100)}%
          </button>
        ))}
      </div>
      <Row label="Capital raised (after 4% listing fees)" value={msek(raised)} accent="#27660a" />
      <Row label="You retain" value={`${Math.round((1 - float) * 100)}% of the shares`} accent={BURGUNDY} />
      <Row label="Reputation bonus" value="+10" />
      <div style={{ fontSize: 12, color: C.inkSoft, margin: "8px 0" }}>
        {float >= 0.5
          ? "⚠️ Majority float: the activist fund CAN out-vote you if your returns slip. High risk, maximum capital."
          : "A small float keeps control safe — the activist can never own more than the free float."}
      </div>
      <button
        onClick={() => dispatch({ type: "DO_IPO", float })}
        disabled={!ok}
        style={{
          padding: "10px 20px", borderRadius: 5, border: `1px solid ${C.brass}`,
          background: ok ? BURGUNDY : "#888", color: C.brassBright,
          fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, cursor: ok ? "pointer" : "default",
        }}
      >
        List the company ({Math.round(float * 100)}% float)
      </button>
    </>
  );
}

/** Ägarbilden efter noteringen + kapitalåtgärder (nyemission/återköp). */
function OwnershipSection({ state, dispatch }: GroupOverviewProps) {
  const shares = state.ipoShares ?? { total: 10_000_000, public: 3_000_000 };
  const fbab = state.stocks.find((st) => st.id === "FBAB");
  const price = fbab?.price ?? Math.max(0.01, equityOf(state) / shares.total);
  const activistPct = state.takeoverPressure ?? 0;
  const floatPct = (shares.public / shares.total) * 100;
  const playerPct = 100 - floatPct;
  const freeFloatPct = Math.max(0, floatPct - activistPct);
  const threshold = Math.min(50, playerPct);
  // Förhandsvisningar för åtgärderna
  const issueShares = Math.round(shares.total * 0.1);
  const issueProceeds = Math.round(issueShares * price * 0.95);
  const buybackBudget = Math.round(Math.min(state.cash * 0.5, equityOf(state) * 0.05));
  const canBuyback = shares.public - 0.1 * shares.total > 0 && buybackBudget > price;
  const seg = (w: number, bg: string) => ({
    width: `${Math.max(0, w)}%`, background: bg, height: 14,
  });
  return (
    <>
      <Row label="Status" value="Listed ✓" accent={BURGUNDY} bold />
      <Row label="Share price" value={`$${price.toFixed(2)} · ${(shares.total / 1e6).toFixed(1)}M shares`} />
      <Row label="Market cap" value={msek(Math.round(price * shares.total))} />
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: C.inkSoft, margin: "10px 0 4px", fontWeight: 700 }}>
        OWNERSHIP STRUCTURE
      </div>
      <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: `1px solid ${C.brass}`, marginBottom: 6 }}>
        <div style={seg(playerPct, BURGUNDY)} title="You" />
        <div style={seg(activistPct, "#8a2020")} title="Kronfelt Capital" />
        <div style={seg(freeFloatPct, "#7c8894")} title="Free float" />
      </div>
      <Row
        label={`◼ You${(state.ownerShares ?? 0) > 0 ? ` (of which ${(((state.ownerShares ?? 0) / shares.total) * 100).toFixed(1)}% held privately)` : ""}`}
        value={`${playerPct.toFixed(0)}%`}
        accent={BURGUNDY}
        bold
      />
      <Row label="◼ Kronfelt Capital (activist)" value={`${activistPct.toFixed(1)}%`} accent={activistPct >= threshold - 10 ? "#b83030" : undefined} />
      <Row label="◼ Free float (institutions & retail)" value={`${freeFloatPct.toFixed(1)}%`} />
      <div style={{ fontSize: 12, color: activistPct >= threshold - 10 ? "#b83030" : C.inkSoft, margin: "6px 0 10px" }}>
        {activistPct >= threshold - 10
          ? `⚠️ Kronfelt takes control past ${Math.round(threshold)}%. Buy back shares, pay dividends or lift returns.`
          : `Kronfelt Capital builds its stake on idle cash and weak returns — takeover past ${Math.round(threshold)}%.`}
      </div>
      {(() => {
        // Privatköp: ägarens plånbok (utdelningar) köper aktier ur fria floaten.
        const wealth = state.ownerWealth ?? 0;
        const activistShares = Math.round((shares.total * activistPct) / 100);
        const buyable = Math.min(
          Math.max(0, shares.public - activistShares),
          Math.max(0, shares.public - Math.ceil(shares.total * 0.1)),
        );
        const privateBudget = Math.min(wealth, Math.round(buyable * price));
        const canBuyPrivate = privateBudget > price && buyable > 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <button
              onClick={() => dispatch({ type: "BUY_OWN_SHARES", amount: privateBudget })}
              disabled={!canBuyPrivate}
              style={{
                padding: "8px 14px", borderRadius: 5, border: `1px solid ${C.brass}`,
                background: canBuyPrivate ? "#27660a" : "#888", color: C.brassBright,
                fontWeight: 700, fontSize: 12, cursor: canBuyPrivate ? "pointer" : "default",
              }}
              title="Buy shares from the free float with your private dividend wealth — strengthens your voting control without touching company cash"
            >
              👤 Buy shares privately · up to {msek(privateBudget)}
            </button>
            <span style={{ fontSize: 11, color: C.inkSoft }}>
              Owner wallet: {kr(wealth)} (built by dividends)
            </span>
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => dispatch({ type: "SHARE_ISSUE", pct: 0.1 })}
          style={{
            padding: "8px 14px", borderRadius: 5, border: `1px solid ${C.brass}`,
            background: C.wood, color: C.creamText, fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}
          title={`Issue ${(issueShares / 1e6).toFixed(1)}M new shares at 5% discount`}
        >
          📜 Share issue +10% · raise ~{msek(issueProceeds)}
        </button>
        <button
          onClick={() => dispatch({ type: "SHARE_BUYBACK", amount: buybackBudget })}
          disabled={!canBuyback}
          style={{
            padding: "8px 14px", borderRadius: 5, border: `1px solid ${C.brass}`,
            background: canBuyback ? BURGUNDY : "#888", color: C.brassBright,
            fontWeight: 700, fontSize: 12, cursor: canBuyback ? "pointer" : "default",
          }}
          title="Repurchase and retire shares at a 3% premium (exchange requires ≥10% free float)"
        >
          🔁 Buyback ~{msek(buybackBudget)}
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>
        A share issue dilutes you but fills the treasury; buybacks strengthen your stake and squeeze the activist.
        Dividends are paid under Company → Legacy · Total paid out: {kr(state.dividendsPaid ?? 0)}.
      </div>
    </>
  );
}
