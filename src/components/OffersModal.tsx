import { playSuccess } from "../audio/sound";
import { kr, msek } from "../engine/format";
import { propMarketValue } from "../engine/property";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

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
        <div style={goldRule} />

        {offers.length === 0 ? (
          <div style={{ color: C.inkSoft, fontSize: 14, padding: "20px 0", textAlign: "center" }}>
            Inga aktiva bud just nu. Rivaler lägger ibland bud på dina fastigheter över marknadsvärde.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {offers.map((o) => {
              // Paketbud värderas mot summan av alla ingående fastigheter.
              const ids = o.propertyIds ?? [o.propId];
              const props = state.portfolio.filter((p) => ids.includes(p.id));
              const market = props.length
                ? props.reduce((a, p) => a + propMarketValue(p, state), 0)
                : o.amount;
              const premium = market > 0 ? ((o.amount / market - 1) * 100) : 0;
              return (
                <div key={o.id} style={offerCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {o.propLabel} · {o.districtName}
                    </span>
                    <span style={{ fontSize: 11, color: C.inkSoft }}>löper ut om {o.expiresIn} mån</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 3 }}>
                    {o.from} bjuder
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 800, color: BURGUNDY }}>{msek(o.amount)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: premium >= 0 ? C.positive : C.negative }}>
                      {premium >= 0 ? "+" : ""}{premium.toFixed(0)} % mot marknad
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 1 }}>
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
  position: "fixed", inset: 0, background: "rgba(16,8,8,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1500, padding: 20, animation: "fi-overlay-fade 0.2s ease",
};
const modal: React.CSSProperties = {
  background: THEME.parchment, border: THEME.brassBorder2, borderRadius: 6, padding: 20,
  maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto",
  boxShadow: THEME.panelShadow, color: C.ink,
  animation: "fi-modal-pop 0.25s cubic-bezier(.2,.8,.2,1)",
};
const header: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  fontFamily: FONTS.heading, fontSize: 17, fontWeight: 800, color: BURGUNDY, marginBottom: 8,
};
const goldRule: React.CSSProperties = {
  height: 2, background: THEME.goldRule, marginBottom: 14,
};
const closeBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, color: C.inkSoft, cursor: "pointer",
};
const offerCard: React.CSSProperties = {
  border: `1px solid ${C.brassDim}`, borderRadius: 6, padding: 14, background: C.cream,
};
const acceptBtn: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 6, border: THEME.brassBorder,
  background: BURGUNDY, color: C.brassBright, fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const declineBtn: React.CSSProperties = {
  flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.brassDim}`,
  background: "transparent", color: C.ink, fontWeight: 600, fontSize: 13, cursor: "pointer",
};
