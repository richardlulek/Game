/* Slutskärmen – visas när spelet är över (konkurs, uppköp, förlorat
   scenariorace ...). Förklarar VAD som gick fel (gameOverReason från
   motorn), visar en obduktion av partiet och erbjuder nytt spel.
   Speglar Victory-overlayen i FastighetsImperium. */

import { formatGameDate } from "../engine/date";
import { msek } from "../engine/format";
import type { GameState } from "../engine/types";
import { benchmarkLine, postMortem } from "../engine/postMortem";
import { BURGUNDY, C, FONTS } from "../styles/tokens";

interface Props {
  state: GameState;
  /** Nytt spel: RESET + tillbaka till titelskärmen. */
  onNewGame: () => void;
  /** Stäng overlayen och titta på staden (bannern + Play again finns kvar). */
  onDismiss: () => void;
}

export function GameOverModal({ state, onNewGame, onDismiss }: Props) {
  // Fallback för gamla sparfiler utan orsak.
  const reason = state.gameOverReason ?? {
    icon: "💥",
    title: "Game over",
    text: "The company could not continue. See the log for the final months' events.",
  };

  const monthsPlayed = Math.max(0, state.year * 12 + state.month - 13);
  const years = Math.floor(monthsPlayed / 12);
  const peakEquity = Math.max(0, ...state.history.map((h) => h.equity));
  const milestonesCount = (state.milestones ?? []).length;
  const pm = postMortem(state);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(20,5,5,0.88)", zIndex: 2560,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "linear-gradient(165deg, #f2eeea, #e2d8d2)", border: `2px solid ${BURGUNDY}`, borderRadius: 8,
        padding: "36px 44px", maxWidth: 520, width: "100%", textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,0.55)", maxHeight: "88vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>{reason.icon}</div>
        <div style={{ fontFamily: FONTS.heading, fontSize: 26, fontWeight: 900, color: BURGUNDY, marginBottom: 6 }}>
          {reason.title}
        </div>
        <div style={{ fontSize: 13, color: "#6a5a52", marginBottom: 12 }}>
          {state.companyName ?? "The company"} · {formatGameDate(state.day ?? 1, state.month, state.year)}
        </div>

        {/* Vad gick fel */}
        <div style={{
          textAlign: "left", fontSize: 13.5, lineHeight: 1.55, color: "#3a2a24",
          background: "#efe4dc", border: "1px solid #d0b8ac", borderRadius: 6,
          padding: "12px 16px", marginBottom: 16,
        }}>
          {reason.text}
        </div>

        {/* Obduktion av partiet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18, textAlign: "left" }}>
          {[
            ["Time survived", years > 0 ? `${years} yr ${monthsPlayed % 12} mo` : `${monthsPlayed} mo`],
            ["Peak equity", msek(peakEquity)],
            ["Properties at the end", `${state.portfolio.length}`],
            ["Final debt", msek(state.debt)],
            ["Reputation", `${Math.round(state.reputation)}`],
            ["Milestones", `${milestonesCount} / 10`],
          ].map(([label, val]) => (
            <div key={label as string} style={{ background: "#eadfd8", borderRadius: 4, padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: "#8a7268", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: BURGUNDY }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Vad partiet visade, i siffror. Inga råd – slutsatsen är spelarens
            att dra. Mätningen bakom jämförelsen: peakLeverage.probe. */}
        {pm.peakYear !== null && pm.peakEquity > 0 && (
          <div style={{
            background: "#efe6e0", border: `1px solid ${C.brass}`, borderRadius: 6,
            padding: "12px 16px", marginBottom: 18, textAlign: "left", fontSize: 13, lineHeight: 1.55,
          }}>
            <div style={{ fontSize: 10, color: "#8a7268", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              The record
            </div>
            <div>
              Equity peaked in year {pm.peakYear} at {msek(pm.peakEquity)}, with{" "}
              <strong>{pm.peakProperties} {pm.peakProperties === 1 ? "property" : "properties"}</strong>{" "}
              and {Math.round(pm.peakLtv * 100)}% loan-to-value.
              {pm.largestPortfolio > pm.peakProperties && (
                <> The largest it ever got was {pm.largestPortfolio}{pm.largestYear !== null ? `, in year ${pm.largestYear}` : ""}.</>
              )}
              {pm.yearsAfterPeak > 0 && (
                pm.drawdown >= 1
                  ? <> Over the {pm.yearsAfterPeak} {pm.yearsAfterPeak === 1 ? "year" : "years"} that followed, equity fell past zero.</>
                  : <> Over the {pm.yearsAfterPeak} {pm.yearsAfterPeak === 1 ? "year" : "years"} that followed, equity fell {Math.round(pm.drawdown * 100)}%.</>
              )}
            </div>
            <div style={{ marginTop: 8, color: "#6b5a52" }}>{benchmarkLine(pm)}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onDismiss}
            style={{ padding: "10px 24px", borderRadius: 4, border: `1px solid ${C.brass}`, background: "transparent", color: C.ink, fontWeight: 700, cursor: "pointer" }}
          >
            View the city
          </button>
          <button
            onClick={onNewGame}
            style={{ padding: "10px 24px", borderRadius: 4, border: `1px solid ${C.brass}`, background: BURGUNDY, color: C.brassBright, fontWeight: 700, cursor: "pointer", fontFamily: FONTS.body }}
          >
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
