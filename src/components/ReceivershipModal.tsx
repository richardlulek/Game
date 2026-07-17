/* Företagsrekonstruktion – spelet pausar och spelaren väljer vilka
   tillgångar som säljs för att återställa likviditeten. Egna val säljs
   till −25 % mot värde; lämnas beslutet till förvaltaren blir det −35 %.
   Mönster: AuctionModal (blockerande overlay driven av motor-tillstånd). */

import { equityOf } from "../engine/finance";
import { kr, msek } from "../engine/format";
import { propNOI } from "../engine/property";
import {
  BRIDGE_EQUITY_COVER,
  RECEIVERSHIP_BANK_HIT,
  RECEIVERSHIP_REP_HIT,
  RECEIVER_CHOICE_FACTOR,
  RESTRUCTURING_EXTRA_AMORT,
  RESTRUCTURING_LTV_PENALTY,
  RESTRUCTURING_MONTHS,
  bridgeLoanQuote,
  canSellInReceivership,
  distressQuote,
} from "../engine/receivership";
import type { GameAction, GameState } from "../engine/types";
import { FONTS } from "../styles/tokens";

const R: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2550,
    background: "rgba(22,12,12,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "fi-overlay-fade 0.3s ease",
  },
  box: {
    width: "min(680px, 94vw)",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#f6f1e3",
    border: `2px solid #a33`,
    borderRadius: 10,
    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
    padding: "22px 26px",
    color: "#241f18",
    fontFamily: FONTS.body,
  },
  title: { fontFamily: FONTS.heading, fontSize: 21, fontWeight: 800, marginBottom: 4 },
  sub: { fontSize: 13, color: "#6a6250", marginBottom: 12, lineHeight: 1.45 },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    background: "#f3e2da",
    border: "1px solid #d0a090",
    borderRadius: 8,
    padding: "10px 16px",
    marginBottom: 12,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: "#efe7d2",
    border: "1px solid #d8cfb6",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 8,
  },
  sellBtn: {
    background: "#8a2a1a",
    color: "#f6f1e3",
    border: "none",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  footRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 },
  resolveBtn: {
    flex: 2,
    background: "#27660a",
    color: "#f6f1e3",
    border: "none",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  autoBtn: {
    flex: 1,
    background: "transparent",
    color: "#5a5244",
    border: "1px solid #b9ae90",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};

export function ReceivershipModal({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const rc = state.receivership;
  if (!rc) return null;

  const solvent = state.cash >= 0;
  const quotes = state.portfolio
    .map((p) => ({ p, sellable: canSellInReceivership(p, state), q: distressQuote(p, state, RECEIVER_CHOICE_FACTOR) }))
    .sort((a, b) => b.q.net - a.q.net);
  const anySellable = quotes.some((x) => x.sellable && x.q.net > 0);

  // Övrig likviditet: brygglån, revolverkredit och aktieinnehav.
  const revAvail = state.revolving ? state.revolving.limit - state.revolving.used : 0;
  const holdings = state.stocks.filter((s) => s.owned > 0 && s.competitorName !== "__player__");
  const holdingsValue = holdings.reduce((a, s) => a + s.owned * s.price, 0);
  const bridge = bridgeLoanQuote(state);
  const bridgeAvailable = !solvent && !rc.bridgeUsed && bridge.amount > 0;
  const bridgeCovered = equityOf(state) >= bridge.amount * BRIDGE_EQUITY_COVER;

  // Framsteg mot noll: hur stor del av det ursprungliga underskottet som är täckt.
  const progress = state.cash >= 0 ? 1 : Math.max(0, 1 - -state.cash / rc.shortfall);

  return (
    <div style={R.overlay}>
      <div style={R.box}>
        <div style={R.title}>⚖️ Receivership — the company is being restructured</div>
        <div style={R.sub}>
          Cash has fallen below the bankruptcy floor and the bank has appointed a receiver.
          Choose which assets to sell — your own picks fetch <strong>−25% vs. value</strong>.
          Hand the keys to the receiver and everything goes at <strong>−35%</strong>.
          Get cash back above zero to resolve the restructuring.
        </div>

        {/* Status */}
        <div style={R.statusRow}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#8a6a5a" }}>CASH</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: solvent ? "#27660a" : "#a33" }}>{kr(state.cash)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#8a6a5a" }}>TOWARD SOLVENCY</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{Math.round(progress * 100)}%</div>
          </div>
        </div>

        {/* Konsekvenser: vad krisen redan kostat och vad som följer efteråt */}
        <div style={{ background: "#f3ead4", border: "1px solid #cbb27a", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, lineHeight: 1.5 }}>
          <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 12, letterSpacing: 0.5, marginBottom: 4, color: "#5a4a3a" }}>
            CONSEQUENCES
          </div>
          <div>
            <strong>Already taken:</strong> reputation <span style={{ color: "#a33", fontWeight: 700 }}>−{RECEIVERSHIP_REP_HIT}</span> ·
            bank trust <span style={{ color: "#a33", fontWeight: 700 }}>−{RECEIVERSHIP_BANK_HIT}</span> ·
            the press is circling (scandal risk up)
          </div>
          <div style={{ marginTop: 3 }}>
            <strong>After resolution:</strong> the bank imposes <strong>{RESTRUCTURING_MONTHS}-month covenants</strong> —
            mandatory amortization +{Math.round(RESTRUCTURING_EXTRA_AMORT * 100)}%/yr on existing debt (even below 50% LTV)
            and max loan-to-value cut by {Math.round(RESTRUCTURING_LTV_PENALTY * 100)}pp on new lending.
          </div>
        </div>

        {/* Fastigheter */}
        <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 13, margin: "10px 0 6px", color: "#5a4a3a" }}>
          PROPERTIES — restructuring terms (−25%)
        </div>
        {quotes.length === 0 && (
          <div style={{ fontSize: 13, color: "#8a8272", marginBottom: 8 }}>No properties left to sell.</div>
        )}
        {quotes.map(({ p, sellable, q }) => (
          <div key={p.id} style={{ ...R.row, opacity: sellable ? 1 : 0.55 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {p.typeLabel} · {p.districtName}
              </div>
              <div style={{ fontSize: 12, color: "#6a6250" }}>
                Value {msek(q.value)} → sells for {msek(q.salePrice)} · pays off {msek(q.payoff)} debt ·{" "}
                {p.tenants.length} tenant{p.tenants.length === 1 ? "" : "s"} · NOI {kr(Math.round(propNOI(p, state) / 12))}/mo
              </div>
            </div>
            {sellable ? (
              <button style={R.sellBtn} onClick={() => dispatch({ type: "RECEIVER_SELL", id: p.id })}>
                Sell · net +{msek(q.net)}
              </button>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a6a2a", whiteSpace: "nowrap" }}>
                🔒 Protected by clause 7b
              </span>
            )}
          </div>
        ))}

        {/* Övrig likviditet */}
        {(bridgeAvailable || revAvail > 0 || holdings.length > 0) && (
          <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 13, margin: "12px 0 6px", color: "#5a4a3a" }}>
            OTHER LIQUIDITY
          </div>
        )}
        {bridgeAvailable && (
          <div style={{ ...R.row, opacity: bridgeCovered ? 1 : 0.6 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>🏦 Bridge loan — keep the buildings</div>
              <div style={{ fontSize: 12, color: "#6a6250" }}>
                {msek(bridge.amount)} at <strong>{bridge.rate.toFixed(2)}%/yr punitive interest</strong>, due in {bridge.months} mo ·
                requires {BRIDGE_EQUITY_COVER}× equity coverage{bridgeCovered ? "" : " — your equity is too thin"} · once per crisis
              </div>
            </div>
            <button
              style={{ ...R.sellBtn, background: bridgeCovered ? "#1a4a7a" : "#b9ae90", cursor: bridgeCovered ? "pointer" : "default" }}
              disabled={!bridgeCovered}
              onClick={() => dispatch({ type: "BRIDGE_LOAN" })}
            >
              Borrow {msek(bridge.amount)}
            </button>
          </div>
        )}
        {revAvail > 0 && (
          <div style={R.row}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Revolving credit</div>
              <div style={{ fontSize: 12, color: "#6a6250" }}>{msek(revAvail)} unused · 1.5%/yr interest on the drawn amount</div>
            </div>
            <button style={{ ...R.sellBtn, background: "#5a3a00" }} onClick={() => dispatch({ type: "DRAW_REVOLVING", amount: revAvail })}>
              Draw {msek(revAvail)}
            </button>
          </div>
        )}
        {holdings.map((st) => (
          <div key={st.id} style={R.row}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Shares: {st.name}</div>
              <div style={{ fontSize: 12, color: "#6a6250" }}>{st.owned} shares @ ${st.price.toFixed(2)}</div>
            </div>
            <button
              style={{ ...R.sellBtn, background: "#5a3a00" }}
              onClick={() => dispatch({ type: "MARKET_ORDER", stockId: st.id, side: "sell", qty: st.owned })}
            >
              Sell all · ≈{msek(Math.round(st.owned * st.price))}
            </button>
          </div>
        ))}
        {holdings.length > 1 && (
          <div style={{ fontSize: 11, color: "#8a8272", marginTop: -2, marginBottom: 6 }}>
            Total holdings ≈ {msek(holdingsValue)}
          </div>
        )}

        {/* Utgångar */}
        <div style={R.footRow}>
          <button
            style={{ ...R.resolveBtn, ...(solvent ? {} : { background: "#b9ae90", cursor: "default" }) }}
            disabled={!solvent}
            onClick={() => dispatch({ type: "RESOLVE_RECEIVERSHIP" })}
          >
            {solvent ? "✅ Resolve the restructuring" : `Resolve (needs cash ≥ 0, now ${kr(state.cash)})`}
          </button>
          {anySellable ? (
            <button style={R.autoBtn} onClick={() => dispatch({ type: "RECEIVER_AUTO" })}>
              Let the receiver decide (−35%)
            </button>
          ) : (
            !solvent && (
              <button style={{ ...R.autoBtn, color: "#a33", borderColor: "#a33" }} onClick={() => dispatch({ type: "ACCEPT_BANKRUPTCY" })}>
                💥 Accept bankruptcy
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
