/* Detaljplaneauktion – kommunen släpper ett nytt kvarter och spelet
   pausar tills klubban faller. Rivalerna bjuder utifrån sina agendor. */

import { msek } from "../engine/format";
import type { GameAction, GameState } from "../engine/types";
import { C, FONTS } from "../styles/tokens";

const A: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2500,
    background: "rgba(12,22,18,0.66)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "fi-overlay-fade 0.3s ease",
  },
  box: {
    width: "min(520px, 92vw)",
    background: "#f6f1e3",
    border: `2px solid ${C.brass}`,
    borderRadius: 10,
    boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
    padding: "22px 26px",
    color: "#241f18",
    fontFamily: FONTS.body,
  },
  title: { fontFamily: FONTS.heading, fontSize: 21, fontWeight: 800, marginBottom: 4 },
  sub: { fontSize: 13, color: "#6a6250", marginBottom: 14 },
  bidRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    background: "#efe7d2",
    border: "1px solid #d8cfb6",
    borderRadius: 8,
    padding: "12px 16px",
    marginBottom: 14,
  },
  bid: { fontSize: 26, fontWeight: 900 },
  leader: { fontSize: 13, fontWeight: 700 },
  btnRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  bidBtn: {
    flex: 1,
    background: C.burgundy,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },
  passBtn: {
    flex: 1,
    background: "transparent",
    color: "#5a5244",
    border: "1px solid #b9ae90",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};

export function AuctionModal({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (a: GameAction) => void;
}) {
  const a = state.auction;
  if (!a) return null;
  const playerLeads = a.leader === "player";
  const nextBid = Math.round(((a.leader ? a.currentBid * 1.08 : a.minBid) / 10_000)) * 10_000;
  const affordable = state.cash >= nextBid;

  return (
    <div style={A.overlay}>
      <div style={A.box}>
        <div style={A.title}>🏛️ Zoning auction — {a.districtName}</div>
        <div style={A.sub}>
          The municipality releases a new block with {a.parcels}{" "}
          {a.parcels === 1 ? "build-ready lot" : "build-ready lots"}. The winner owns the land.
          Bid round {a.round + 1} · opening {msek(a.minBid)} · your cash {msek(state.cash)}.
        </div>
        <div style={A.bidRow}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#8a8272" }}>HIGHEST BID</div>
            <div style={A.bid}>{a.leader ? msek(a.currentBid) : "–"}</div>
          </div>
          <div style={{ ...A.leader, color: playerLeads ? "#27660a" : "#8a4a3a" }}>
            {a.leader === null ? "No bids yet" : playerLeads ? "YOU lead the bidding" : `${a.leader} leads`}
          </div>
        </div>
        <div style={A.btnRow}>
          {playerLeads ? (
            <button style={A.bidBtn} onClick={() => dispatch({ type: "AUCTION_PASS" })}>
              🔨 Gavel — win for {msek(a.currentBid)}
            </button>
          ) : (
            <>
              <button
                style={{ ...A.bidBtn, ...(affordable ? {} : { background: "#b9ae90", cursor: "default" }) }}
                disabled={!affordable}
                onClick={() => dispatch({ type: "AUCTION_BID" })}
              >
                Bid {msek(nextBid)}
              </button>
              <button style={A.passBtn} onClick={() => dispatch({ type: "AUCTION_PASS" })}>
                {a.leader ? `Pass — concede to ${a.leader}` : "Pass on the auction"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
