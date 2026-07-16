import { formatMonthYear } from "../engine/date";
import { equityOf } from "../engine/finance";
import { personaFor } from "../engine/rivalPersonas";
import type { GameState, LogEntry } from "../engine/types";
import { FONTS } from "../styles/tokens";
import { logColor } from "./logColor";
import { RivalCard } from "./RivalCard";

interface Props {
  state: GameState;
}

const HEADLINE_KINDS = new Set(["event", "warn", "income", "buy", "sell"]);

/** Tidningssektion per loggpost – ger varje notis en avdelning som i en riktig tidning. */
function sectionFor(e: LogEntry): string {
  if (e.rival) return "RIVALS";
  switch (e.kind) {
    case "buy":
    case "sell": return "DEALS";
    case "warn": return "CITY DESK";
    case "income": return "MARKETS";
    case "expense": return "LEDGER";
    case "upg": return "PROPERTY";
    default: return "CITY";
  }
}

/** Renodlar en loggrad till en rubrik: droppar ledande emoji och versaliserar. */
function headlineText(t: string): string {
  return t.replace(/^[^\p{L}\p{N}"]+/u, "").trim();
}

const paper = "#f4ecd6";
const ink = "#1a0a00";
const sepia = "#6a4a00";
const rule = "#2a1a00";

export function NewsFeedPanel({ state }: Props) {
  const { month, year, log } = state;

  const recent = log.slice(0, 40);
  const leadIdx = recent.findIndex((l) => HEADLINE_KINDS.has(l.kind));
  const lead = leadIdx >= 0 ? recent[leadIdx] : undefined;
  const rest = recent.filter((_, i) => i !== leadIdx);
  const features = rest.slice(0, 6);
  const briefs = rest.slice(6, 18);

  // Marknadsruta: rank bland konkurrenterna.
  const myEq = equityOf(state);
  const rank =
    [...state.competitors.map((c) => c.equity), myEq].sort((a, b) => b - a).indexOf(myEq) + 1;
  const field = state.competitors.length + 1;
  const cycle = state.marketCycle;

  const Kicker = ({ e }: { e: LogEntry }) => (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "baseline", fontSize: 9.5, letterSpacing: 2, fontWeight: 800 }}>
      <span style={{ color: logColor(e.kind) }}>{sectionFor(e)}</span>
      {e.at && <span style={{ color: sepia, fontWeight: 600, letterSpacing: 0.5 }}>· {e.at}</span>}
    </span>
  );

  return (
    <div style={{
      fontFamily: FONTS.body, color: ink, maxWidth: 760, margin: "0 auto",
      // Tidningen är ett medvetet tematiskt element: varmt papper mot mörkt fönster.
      background: paper,
      backgroundImage: "repeating-linear-gradient(0deg, rgba(120,90,30,0.035) 0 1px, transparent 1px 3px)",
      border: "1px solid #cbb27a",
      borderRadius: 8,
      padding: "22px 26px",
      boxShadow: "0 10px 30px rgba(4,8,14,0.5)",
    }}>
      {/* Masthead */}
      <div style={{ textAlign: "center", borderBottom: `3px double ${rule}`, paddingBottom: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, letterSpacing: 6, color: sepia, fontWeight: 600 }}>
          “ALL THE PROPERTY THAT’S FIT TO PRINT”
        </div>
        <div style={{ fontFamily: FONTS.display ?? FONTS.heading, fontSize: 44, fontWeight: 900, letterSpacing: 2, color: ink, lineHeight: 1.05, margin: "2px 0" }}>
          THE PROPERTY&shy;POST
        </div>
        <div style={{ fontSize: 11.5, color: sepia, display: "flex", justifyContent: "center", gap: 16, borderTop: `1px solid ${rule}55`, paddingTop: 6, marginTop: 2 }}>
          <span>Vol. {year} · No. {String(month).padStart(2, "0")}</span>
          <span>{formatMonthYear(month, year)}</span>
          <span>Est. 1925</span>
          <span>Price 2 kr</span>
        </div>
      </div>

      {recent.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#8a6a2a", fontStyle: "italic" }}>
          The presses are warm but the page is bare. Play a few months and the headlines will write themselves.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 210px", gap: 20, marginTop: 14 }}>
          {/* ── Main column ─────────────────────────────────── */}
          <div style={{ minWidth: 0 }}>
            {/* Lead story */}
            {lead && (
              <div style={{ borderBottom: `1px solid ${rule}44`, paddingBottom: 14, marginBottom: 14 }}>
                <div style={{ marginBottom: 4 }}><Kicker e={lead} /></div>
                {lead.rival && personaFor(lead.rival) && (
                  <div style={{ marginBottom: 8 }}><RivalCard company={lead.rival} variant="inline" size={34} /></div>
                )}
                <div style={{
                  fontFamily: FONTS.display ?? FONTS.heading, fontSize: 27, fontWeight: 900,
                  lineHeight: 1.12, color: ink, marginBottom: 6,
                }}>
                  {headlineText(lead.t)}
                </div>
                <div style={{ fontSize: 12, color: sepia, fontStyle: "italic" }}>
                  {cycle?.phase === "boom" ? "Market on the rise — buyers circle every listing."
                    : cycle?.phase === "bust" ? "Market under pressure — the cautious hold their cash."
                    : "Steady trading across the city’s districts."}
                </div>
              </div>
            )}

            {/* Feature articles — two columns */}
            <div style={{ columnCount: 2, columnGap: 18 }}>
              {features.map((e, i) => (
                <div key={i} style={{ breakInside: "avoid", marginBottom: 12, borderLeft: `2px solid ${logColor(e.kind)}`, paddingLeft: 9 }}>
                  <div style={{ marginBottom: 3 }}><Kicker e={e} /></div>
                  {e.rival && personaFor(e.rival) && (
                    <div style={{ marginBottom: 4 }}><RivalCard company={e.rival} variant="inline" size={26} /></div>
                  )}
                  <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, color: ink }}>
                    {headlineText(e.t)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <div style={{ borderLeft: `1px solid ${rule}44`, paddingLeft: 16, minWidth: 0 }}>
            {/* Market box */}
            <div style={{ border: `1px solid ${rule}`, borderRadius: 3, padding: "9px 11px", marginBottom: 14, background: "#efe4c6" }}>
              <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 11, letterSpacing: 1.5, textAlign: "center", borderBottom: `1px solid ${rule}66`, paddingBottom: 4, marginBottom: 6 }}>
                MARKET REPORT
              </div>
              <Row k="Cycle" v={cycle ? (cycle.phase === "boom" ? "📈 Boom" : cycle.phase === "bust" ? "📉 Downturn" : "→ Stable") : "→ Stable"} />
              {cycle && cycle.phase !== "stable" && <Row k="Duration" v={`${cycle.monthsRemaining} mo left`} />}
              <Row k="Policy rate" v={`${state.interestRate.toFixed(2)}%`} />
              <Row k="Your standing" v={`#${rank} of ${field}`} />
              <Row k="Reputation" v={`${Math.round(state.reputation)}/100`} />
            </div>

            {/* In brief */}
            {briefs.length > 0 && (
              <>
                <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 11, letterSpacing: 1.5, borderBottom: `2px solid ${rule}`, paddingBottom: 3, marginBottom: 7 }}>
                  IN BRIEF
                </div>
                {briefs.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: ink, lineHeight: 1.4, marginBottom: 7, display: "flex", gap: 6 }}>
                    <span style={{ color: logColor(e.kind), flexShrink: 0 }}>▪</span>
                    <span>{headlineText(e.t)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2px 0", color: "#3a2a08" }}>
      <span style={{ color: "#6a4a00" }}>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}
