import { formatMonthYear } from "../engine/date";
import type { GameState } from "../engine/types";
import { FONTS } from "../styles/tokens";
import { logColor } from "./logColor";

interface Props {
  state: GameState;
}

const HEADLINE_KINDS = new Set(["event", "warn", "income", "buy", "sell"]);

export function NewsFeedPanel({ state }: Props) {
  const { month, year, log } = state;

  const headline = log.find((l) => HEADLINE_KINDS.has(l.kind));
  const recent = log.slice(0, 40);

  return (
    <div style={{
      fontFamily: FONTS.body, color: "#1a0a00", maxWidth: 720, margin: "0 auto",
      // Tidningen är ett medvetet tematiskt element: varmt papper så den mörka
      // tidningssättningen blir läsbar (annars mörk text på mörkt fönster).
      background: "#f4ecd6",
      border: "1px solid #cbb27a",
      borderRadius: 8,
      padding: "22px 26px",
      boxShadow: "0 10px 30px rgba(4,8,14,0.5)",
    }}>
      {/* Newspaper header */}
      <div style={{
        textAlign: "center", borderBottom: "3px solid #2a1a00",
        paddingBottom: 12, marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, letterSpacing: 6, color: "#6a4a00", fontWeight: 600, marginBottom: 4 }}>
          EST. 1925 · DAILY PAPER FOR THE PROPERTY MARKET
        </div>
        <div style={{ fontFamily: FONTS.display ?? FONTS.heading, fontSize: 40, fontWeight: 900, letterSpacing: 2, color: "#1a0a00" }}>
          THE PROPERTY&shy;POST
        </div>
        <div style={{ fontSize: 12, color: "#6a4a00", marginTop: 4, display: "flex", justifyContent: "center", gap: 20 }}>
          <span>{formatMonthYear(month, year)}</span>
          <span>|</span>
          <span>{log.length} log entries</span>
          <span>|</span>
          <span>Portfolio: {state.portfolio.length} assets</span>
        </div>
      </div>

      {/* Lead story */}
      {headline && (
        <div style={{
          background: "#e9efff", border: "1px solid #c8a030",
          borderRadius: 4, padding: "16px 20px", marginBottom: 20,
          borderLeft: `5px solid ${logColor(headline.kind)}`,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 700, color: "#6a4a00", marginBottom: 6 }}>
            SENASTE NYTT
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: "#1a0a00" }}>
            {headline.t}
          </div>
        </div>
      )}

      {/* Market cycle banner */}
      {state.marketCycle && state.marketCycle.phase !== "stable" && (
        <div style={{
          padding: "10px 16px", marginBottom: 16, borderRadius: 4,
          background: state.marketCycle.phase === "boom" ? "#0a2a0a" : "#2a0a0a",
          color: state.marketCycle.phase === "boom" ? "#80e080" : "#f87a7a",
          fontWeight: 700, fontSize: 13,
          border: `1px solid ${state.marketCycle.phase === "boom" ? "#27660a" : "#c0392b"}`,
        }}>
          {state.marketCycle.phase === "boom" ? "📈 BOOM" : "📉 DOWNTURN"} — {state.marketCycle.monthsRemaining} months left
        </div>
      )}

      {/* News items grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {recent.slice(1).map((entry, i) => (
          <div key={i} style={{
            padding: "10px 14px",
            background: "#f0f4f9",
            border: "1px solid #d4b870",
            borderRadius: 4,
            borderLeft: `3px solid ${logColor(entry.kind)}`,
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            <div style={{ color: "#1a0a00" }}>{entry.t}</div>
          </div>
        ))}
      </div>

      {recent.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          Nothing to report yet. Start the game and read the news feed here.
        </div>
      )}
    </div>
  );
}
