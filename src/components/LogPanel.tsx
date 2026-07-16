import { useState } from "react";
import type { LogEntry, LogKind } from "../engine/types";
import { S } from "../styles/styles";
import { C, FONTS } from "../styles/tokens";
import { logColor } from "./logColor";

interface LogPanelProps {
  log: LogEntry[];
}

const KIND_LABELS: Record<LogKind, string> = {
  info:    "Info",
  warn:    "Warning",
  buy:     "Buy",
  sell:    "Sell",
  upg:     "Upgrade",
  income:  "Income",
  expense: "Expense",
  event:   "Event",
};

const ALL_KINDS: LogKind[] = ["buy", "sell", "income", "expense", "event", "warn", "upg", "info"];

export function LogPanel({ log }: LogPanelProps) {
  const [activeKind, setActiveKind] = useState<LogKind | "all">("all");

  const filtered = activeKind === "all" ? log : log.filter((l) => l.kind === activeKind);

  return (
    <div>
      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button
          onClick={() => setActiveKind("all")}
          style={chipStyle(activeKind === "all")}
        >
          All ({log.length})
        </button>
        {ALL_KINDS.map((k) => {
          const count = log.filter((l) => l.kind === k).length;
          if (count === 0) return null;
          return (
            <button
              key={k}
              onClick={() => setActiveKind(k)}
              style={chipStyle(activeKind === k)}
            >
              <span style={{ color: logColor(k) }}>■</span> {KIND_LABELS[k]} ({count})
            </button>
          );
        })}
      </div>

      <div style={S.logBox}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, color: C.inkSoft, textAlign: "center", fontFamily: FONTS.body }}>
            No events for the selected category.
          </div>
        ) : (
          filtered.map((l, i) => {
            // Loggen är nyast-först: rita en månadsrubrik när datumet ändras.
            const showHeader = l.at !== undefined && (i === 0 || filtered[i - 1].at !== l.at);
            return (
              <div key={i}>
                {showHeader && <div style={monthHeader}>{l.at}</div>}
                <div style={{ ...S.logItem, color: logColor(l.kind), display: "flex", gap: 8 }}>
                  <span style={{ color: logColor(l.kind), flexShrink: 0 }}>■</span>
                  <span style={{ flex: 1 }}>{l.t}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const monthHeader: React.CSSProperties = {
  position: "sticky",
  top: 0,
  padding: "5px 10px",
  margin: "6px 0 2px",
  fontFamily: FONTS.heading,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: C.brassBright,
  background: C.woodDark,
  borderBottom: `1px solid ${C.brass}55`,
  zIndex: 1,
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px", borderRadius: 12, border: "1px solid #ccc",
    background: active ? "#5a3a00" : "#f2f5f9", color: active ? "#f5e6c0" : "#555",
    fontWeight: active ? 700 : 400, fontSize: 12, cursor: "pointer",
    fontFamily: FONTS.body,
  };
}
