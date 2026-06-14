import { useEffect, useRef, useState } from "react";
import { playIncome, playWarn } from "../audio/sound";
import type { LogEntry, LogKind } from "../engine/types";

interface ToastItem {
  id: number;
  entry: LogEntry;
}

const STYLE_BY_KIND: Record<string, { bg: string; border: string; icon: string }> = {
  income:  { bg: "#eef7ee", border: "#27660a", icon: "💰" },
  sell:    { bg: "#fff6e8", border: "#b07010", icon: "🤝" },
  buy:     { bg: "#eef2fb", border: "#2a4a8a", icon: "🏠" },
  warn:    { bg: "#fdeeee", border: "#c0392b", icon: "⚠️" },
  expense: { bg: "#fdeeee", border: "#c0392b", icon: "📉" },
  event:   { bg: "#f3eefb", border: "#5a2a7a", icon: "📰" },
  upg:     { bg: "#eef7ee", border: "#2a6a1a", icon: "🔧" },
  info:    { bg: "#f4f4f4", border: "#888",    icon: "ℹ️" },
};

function soundFor(kind: LogKind) {
  if (kind === "income" || kind === "sell") playIncome();
  else if (kind === "warn" || kind === "expense") playWarn();
}

/** Flytande notiser som speglar nya, viktiga loggrader. */
export function Toasts({ log }: { log: LogEntry[] }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prevTop = useRef<LogEntry | null>(null);
  const first = useRef(true);
  const idRef = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prevTop.current = log[0] ?? null;
      return;
    }
    const idx = prevTop.current ? log.indexOf(prevTop.current) : -1;
    prevTop.current = log[0] ?? null;
    // idx === -1 → loggen byttes ut helt (load/reset): toasta inte.
    if (idx <= 0) return;

    const fresh = log
      .slice(0, idx)
      .filter((e) => !e.t.startsWith("Månad ")) // hoppa över rutinsammanfattningen
      .slice(0, 4)
      .reverse(); // äldst först → nyast hamnar nederst i stacken
    if (fresh.length === 0) return;

    const added = fresh.map((entry) => ({ id: idRef.current++, entry }));
    setToasts((cur) => [...cur, ...added].slice(-5));
    soundFor(fresh[fresh.length - 1].kind);

    const timers = added.map((t) =>
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 4200),
    );
    return () => timers.forEach(clearTimeout);
  }, [log]);

  if (toasts.length === 0) return null;

  return (
    <div style={container}>
      {toasts.map((t) => {
        const st = STYLE_BY_KIND[t.entry.kind] ?? STYLE_BY_KIND.info;
        return (
          <div
            key={t.id}
            style={{
              ...toastStyle,
              background: st.bg,
              borderLeft: `4px solid ${st.border}`,
            }}
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{st.icon}</span>
            <span style={{ fontSize: 13, color: "#222", lineHeight: 1.35 }}>{t.entry.t}</span>
          </div>
        );
      })}
    </div>
  );
}

const container: React.CSSProperties = {
  position: "fixed",
  right: 14,
  bottom: 48,
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxWidth: 340,
  pointerEvents: "none",
};

const toastStyle: React.CSSProperties = {
  display: "flex",
  gap: 9,
  alignItems: "flex-start",
  padding: "10px 13px",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
  animation: "fi-toast-in 0.3s cubic-bezier(.2,.8,.2,1)",
  pointerEvents: "auto",
  cursor: "pointer",
};
