/* Tidningsförstasida som firar bolagets expansion – "STADSBLADET"
   trycker en rubrik när spelarens bolag når en ny nivå. */

import { tierForLevel } from "../engine/company";
import { formatMonthYear } from "../engine/date";
import { msek } from "../engine/format";
import { equityOf } from "../engine/finance";
import type { StoryFront } from "../engine/story";
import type { GameState } from "../engine/types";

const N: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2600,
    background: "rgba(12,22,18,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "fi-overlay-fade 0.35s ease",
  },
  paper: {
    width: "min(620px, 92vw)",
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#e9eef5",
    color: "#241f18",
    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
    padding: "22px 30px 24px",
    transform: "rotate(-0.6deg)",
    border: "1px solid #d8cfb6",
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  masthead: {
    textAlign: "center",
    borderBottom: "3px double #241f18",
    paddingBottom: 8,
    marginBottom: 4,
  },
  mastheadTitle: { fontSize: 34, fontWeight: 900, letterSpacing: 6, lineHeight: 1 },
  dateline: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    letterSpacing: 1,
    borderBottom: "1px solid #241f18",
    padding: "4px 2px",
    marginBottom: 14,
    textTransform: "uppercase",
  },
  headline: { fontSize: 30, fontWeight: 900, lineHeight: 1.12, marginBottom: 8 },
  sub: { fontSize: 15, fontStyle: "italic", color: "#4a4335", marginBottom: 14 },
  photoRow: { display: "flex", gap: 16, alignItems: "stretch", marginBottom: 14 },
  photo: {
    flex: "0 0 150px",
    background: "#e6dcc2",
    border: "1px solid #b9ae90",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 64,
    padding: "18px 8px 8px",
  },
  photoCaption: { fontSize: 10, color: "#6a6250", marginTop: 10, textAlign: "center" },
  columns: { fontSize: 13, lineHeight: 1.5, columnCount: 2, columnGap: 18, textAlign: "justify" },
  btnRow: { textAlign: "center", marginTop: 18 },
  btn: {
    background: "#241f18",
    color: "#e9eef5",
    border: "none",
    padding: "10px 30px",
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};

export function NewspaperModal({
  state,
  level,
  front,
  onClose,
}: {
  state: GameState;
  /** Bolagsnivå (nivå-tidningen). Ignoreras när `front` anges. */
  level?: number;
  /** Story-förstasida (kapitelslut i berättelseläget). */
  front?: StoryFront;
  onClose: () => void;
}) {
  const tier = tierForLevel(level ?? state.companyLevel ?? 1);
  const name = state.companyName ?? "Bolaget";
  const headline = front?.headline ?? tier.headline.replace("{n}", name);
  const sub = front?.sub ?? tier.desc;
  const icon = front?.icon ?? tier.icon;
  const caption = front?.caption ?? "Bolagets nya huvudkontor.";
  const units = state.portfolio.filter((p) => p.status === "klar").length;

  return (
    <div style={N.overlay} onClick={onClose}>
      <div style={N.paper} onClick={(e) => e.stopPropagation()}>
        <div style={N.masthead}>
          <div style={N.mastheadTitle}>STADSBLADET</div>
        </div>
        <div style={N.dateline}>
          <span>{formatMonthYear(state.month, state.year)}</span>
          <span>Näringsliv</span>
          <span>Pris 2 kr</span>
        </div>
        <div style={N.headline}>{headline}</div>
        <div style={N.sub}>{sub}</div>
        <div style={N.photoRow}>
          <div style={N.photo}>
            {icon}
            <div style={N.photoCaption}>{caption}</div>
          </div>
          <div style={{ ...N.columns, columnCount: 1, flex: 1 }}>
            {front
              ? front.body
              : `Med ett eget kapital om ${msek(equityOf(state))} och ${units} fastigheter i beståndet tar ${name} nu steget till att bli ${tier.name.toLowerCase()}. Grannar och konkurrenter höjer på ögonbrynen när bolagets skylt monteras på det nya huvudkontoret.`}
          </div>
        </div>
        {!front && (
          <div style={N.columns}>
            "Vi har bara börjat", säger bolagets grundare i en kommentar och pekar
            mot stadskärnan. Analytiker noterar att bolaget vuxit metodiskt genom
            uthyrning, förvärv och underhåll — och att organisationen nu rustas för
            nästa steg. Stadsbladet har sökt konkurrenterna, som avböjer att
            kommentera uppstickarens frammarsch. Hyresgästföreningen välkomnar
            beskedet men påminner om ansvaret som följer med ett växande bestånd.
          </div>
        )}
        <div style={N.btnRow}>
          <button style={N.btn} onClick={onClose}>
            FORTSÄTT ▸
          </button>
        </div>
      </div>
    </div>
  );
}
