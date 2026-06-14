/* ============================================================
   Koncern – art-deco översikt över holdingstrukturen.
   Förmögenhetsfördelning, dotterbolag, ägarandelar i rivaler,
   och nyckeltal. Läser endast tillstånd, dispatchar inget.
   ============================================================ */

import { kr, msek, pct } from "../engine/format";
import { equityOf, loanTerms, portfolioValue } from "../engine/finance";
import { propNOI } from "../engine/property";
import { stockHoldingsValue, subsidiaryValue } from "../engine/stocks";
import type { GameState } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

interface GroupOverviewProps {
  state: GameState;
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

export function GroupOverview({ state }: GroupOverviewProps) {
  const cash = state.cash;
  const propVal = portfolioValue(state);
  const stocksVal = stockHoldingsValue(state);
  const subsVal = subsidiaryValue(state);
  const equity = equityOf(state);

  // Stapelsegment över de positiva komponenterna.
  const segments = [
    { label: "Kassa", value: cash, color: C.brass },
    { label: "Fastigheter", value: propVal, color: C.green },
    { label: "Aktier", value: stocksVal, color: BURGUNDY },
    { label: "Dotterbolag", value: subsVal, color: C.gold },
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
        <h3 style={heading}>Förmögenhetsfördelning</h3>
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

        <Row label="Kassa" value={kr(cash)} swatch={C.brass} />
        <Row label="Fastigheter" value={kr(propVal)} swatch={C.green} />
        <Row label="Aktieinnehav" value={kr(stocksVal)} swatch={BURGUNDY} />
        <Row label="Dotterbolag" value={kr(subsVal)} swatch={C.gold} />
        <Row label="Skulder" value={"−" + kr(state.debt)} accent={C.negative} />
        <GoldRule />
        <Row label="Eget kapital" value={kr(equity)} accent={BURGUNDY} bold />
      </div>

      {/* ── Nyckeltal ─────────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Nyckeltal</h3>
        <GoldRule />
        <Row label="Eget kapital" value={msek(equity)} accent={BURGUNDY} bold />
        <Row
          label="Månadens kassaflöde"
          value={kr(monthlyCashflow)}
          accent={monthlyCashflow >= 0 ? C.positive : C.negative}
        />
        <Row label="Reputation" value={`${Math.round(state.reputation)} / 100`} />
        <Row label="Antal fastigheter" value={state.portfolio.length.toLocaleString("sv-SE")} />
        <Row
          label="Antal aktieposter"
          value={state.stocks
            .filter((s) => s.owned > 0)
            .length.toLocaleString("sv-SE")}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: C.inkSoft }}>
          Kassaflöde = driftnetto − ränta + utdelningar + dotterbolag (per månad).
        </div>
      </div>

      {/* ── Dotterbolag ───────────────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Dotterbolag</h3>
        <GoldRule />
        {state.subsidiaries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {state.subsidiaries.map((s, i) => (
              <div
                key={s.name + i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom:
                    i < state.subsidiaries.length - 1
                      ? "1px solid rgba(201,164,92,0.3)"
                      : "none",
                }}
              >
                <span style={{ fontFamily: FONTS.heading, fontSize: 15, color: C.ink }}>
                  {s.name}
                </span>
                <span style={{ ...num, fontWeight: 700, color: C.green }}>
                  {kr(s.monthlyIncome)}/mån
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
            Inga dotterbolag ännu — köp majoritet i en konkurrent på Börsen och förvärva den.
          </div>
        )}
      </div>

      {/* ── Ägarandelar i rivaler ─────────────────────────── */}
      <div style={card}>
        <h3 style={heading}>Ägarandelar i rivaler</h3>
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
                    <span style={subLabel}>Ägarandel {pct(share)}</span>
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
            Du äger inga aktier i konkurrenterna ännu. Köp aktier på Börsen för att bygga inflytande.
          </div>
        )}
      </div>
    </div>
  );
}
