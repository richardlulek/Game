import { playSuccess } from "../audio/sound";
import { kr, msek } from "../engine/format";
import { propMarketValue } from "../engine/property";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}

/** Inkorg med inkommande bud på dina fastigheter. */
export function OffersModal({ state, dispatch, onClose }: Props) {
  const offers = state.offers ?? [];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span>📨 Inkommande bud ({offers.length})</span>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        {offers.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14, padding: "20px 0", textAlign: "center" }}>
            Inga aktiva bud just nu. Rivaler lägger ibland bud på dina fastigheter över marknadsvärde.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {offers.map((o) => {
              const prop = state.portfolio.find((p) => p.id === o.propId);
              const market = prop ? propMarketValue(prop, state) : o.amount;
              const premium = market > 0 ? ((o.amount / market - 1) * 100) : 0;
              return (
                <div key={o.id} style={offerCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {o.propLabel} · {o.districtName}
                    </span>
                    <span style={{ fontSize: 11, color: "#999" }}>löper ut om {o.expiresIn} mån</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                    {o.from} bjuder
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: BURGUNDY }}>{msek(o.amount)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: premium >= 0 ? "#27660a" : "#c0392b" }}>
                      {premium >= 0 ? "+" : ""}{premium.toFixed(0)} % mot marknad
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                    Marknadsvärde: {kr(market)}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      style={acceptBtn}
                      onClick={() => {
                        playSuccess();
                        dispatch({ type: "ACCEPT_OFFER", offerId: o.id });
                      }}
                    >
                      Acceptera & sälj
                    </button>
                    <button
                      style={declineBtn}
                      onClick={() => dispatch({ type: "DECLINE_OFFER", offerId: o.id })}
                    >
                      Avböj
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(20,8,12,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1500, padding: 20, animation: "fi-overlay-fade 0.2s ease",
};
const modal: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 20,
  maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto",
  boxShadow: "0 12px 48px rgba(0,0,0,0.35)",
  animation: "fi-modal-pop 0.25s cubic-bezier(.2,.8,.2,1)",
};
const header: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  fontSize: 16, fontWeight: 800, color: BURGUNDY, marginBottom: 14,
};
const closeBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer",
};
const offerCard: React.CSSProperties = {
  border: "1px solid #eee", borderRadius: 12, padding: 14, background: "#fafafa",
};
const acceptBtn: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 8, border: "none",
  background: BURGUNDY, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const declineBtn: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ddd",
  background: "#fff", color: "#666", fontWeight: 600, fontSize: 13, cursor: "pointer",
};
