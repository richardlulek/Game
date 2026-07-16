import { useEffect, useRef, useState } from "react";
import { playBuy, playIncome, playWarn } from "../audio/sound";
import type { LogEntry, LogKind } from "../engine/types";
import { C, THEME } from "../styles/tokens";

interface ToastItem {
  id: number;
  entry: LogEntry;
}

/** Färgad vänsterkant per loggtyp – övriga ytor är gemensamma (valnöt/mässing). */
const STYLE_BY_KIND: Record<string, { border: string; icon: string }> = {
  income:  { border: C.positive, icon: "💰" },
  sell:    { border: C.brass,    icon: "🤝" },
  buy:     { border: C.green,    icon: "🏠" },
  warn:    { border: C.negative, icon: "⚠️" },
  expense: { border: C.negative, icon: "📉" },
  event:   { border: C.gold,     icon: "📰" },
  upg:     { border: C.green,    icon: "🔧" },
  info:    { border: C.brassDim, icon: "ℹ️" },
};

function soundFor(kind: LogKind) {
  if (kind === "income" || kind === "sell") playIncome();
  else if (kind === "warn" || kind === "expense") playWarn();
  else if (kind === "buy") playBuy();
}

/**
 * Bara genuint viktiga händelser toastas – varningar, affärer och
 * nyheter. Rutinposter (kvartalskostnader, underhåll, hyresintäkter,
 * policyverkställighet) stannar i Logg/Nyheter, annars dränks spelaren
 * i notiser så fort klockan rullar.
 */
const TOAST_KINDS = new Set<LogKind>(["warn", "buy", "sell", "event"]);

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
      .filter((e) => TOAST_KINDS.has(e.kind))
      .slice(0, 3)
      .reverse(); // äldst först → nyast hamnar nederst i stacken
    if (fresh.length === 0) return;

    const added = fresh.map((entry) => ({ id: idRef.current++, entry }));
    setToasts((cur) => [...cur, ...added].slice(-4));
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
              borderLeft: `4px solid ${st.border}`,
            }}
            onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{st.icon}</span>
            <span style={{ fontSize: 13, color: C.creamText, lineHeight: 1.35 }}>{t.entry.t}</span>
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
  background: C.wood,
  border: `1px solid ${C.brassDim}`,
  borderRadius: 5,
  color: C.creamText,
  boxShadow: `0 4px 16px rgba(20,12,4,0.45), ${THEME.insetGold}`,
  animation: "fi-toast-in 0.3s cubic-bezier(.2,.8,.2,1)",
  pointerEvents: "auto",
  cursor: "pointer",
};
