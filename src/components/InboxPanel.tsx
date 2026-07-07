import type { CSSProperties } from "react";
import { useGameStore } from "../store/gameStore";
import { BURGUNDY } from "../styles/tokens";

const I: Record<string, CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderLeft: `4px solid ${BURGUNDY}`,
    borderRadius: 10,
    padding: "10px 12px",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  title: { fontSize: 13.5, fontWeight: 700 },
  time: { fontSize: 11, color: "#999", whiteSpace: "nowrap" },
  desc: { fontSize: 12.5, color: "#555", margin: "4px 0 8px", lineHeight: 1.4 },
  row: { display: "flex", gap: 6, flexWrap: "wrap" },
  primary: {
    background: BURGUNDY,
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 700,
  },
  secondary: {
    background: "#fff",
    border: "1px solid #ddd",
    color: "#444",
    padding: "6px 12px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
  },
};

/** Inkorgen: väntande beslut med tidsfrist. Klockan pausas när nya dyker upp. */
export function InboxPanel() {
  const inbox = useGameStore((s) => s.state.inbox);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!inbox.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3
        style={{
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: BURGUNDY,
          margin: 0,
        }}
      >
        ⚑ Beslut väntar ({inbox.length})
      </h3>
      {inbox.map((item) => (
        <div key={item.id} style={I.card}>
          <div style={I.head}>
            <span style={I.title}>{item.title}</span>
            <span style={I.time}>{item.monthsLeft} mån kvar</span>
          </div>
          <div style={I.desc}>{item.desc}</div>
          <div style={I.row}>
            {item.options.map((o, i) => (
              <button
                key={o.id}
                style={i === 0 ? I.primary : I.secondary}
                onClick={() => dispatch({ type: "DECIDE", inboxId: item.id, option: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
