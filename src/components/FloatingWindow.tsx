import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { C, FONTS, THEME } from "../styles/tokens";

/**
 * Flytande, dragbart fönster ovanpå stadskartan – à la Capitalism 2,
 * där kartan alltid är världen och flera rapporter/paneler kan vara
 * öppna samtidigt. Dra i titelraden; klick fokuserar (lyfter överst);
 * — minimerar till taskbaren; ✕ eller Esc stänger.
 */
export function FloatingWindow({
  title,
  onClose,
  onMinimize,
  onFocus,
  zIndex = 50,
  offsetIndex = 0,
  children,
}: {
  title: string;
  onClose: () => void;
  onMinimize?: () => void;
  onFocus?: () => void;
  zIndex?: number;
  /** Kaskadposition för nyöppnade fönster. */
  offsetIndex?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ x: 14 + offsetIndex * 32, y: 10 + offsetIndex * 26 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    // Tryck på ✕/— får inte starta drag: pointer-capturen stjäl annars
    // pointerup från knappen så att klicket aldrig fullbordas.
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, drag.current.ox + e.clientX - drag.current.px),
      y: Math.max(0, drag.current.oy + e.clientY - drag.current.py),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  const frame: CSSProperties = {
    position: "absolute",
    left: pos.x,
    top: pos.y,
    width: "min(1000px, calc(100vw - 320px))",
    maxHeight: "calc(100% - 16px)",
    display: "flex",
    flexDirection: "column",
    background: THEME.feltBg,
    border: `1px solid ${C.brass}`,
    borderRadius: 8,
    boxShadow: "0 14px 44px rgba(0,0,0,0.55)",
    pointerEvents: "auto",
    zIndex,
    overflow: "hidden",
  };
  const titleBar: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 12px",
    background: THEME.wood,
    borderBottom: `1px solid ${C.brass}77`,
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
  };
  const winBtn: CSSProperties = {
    background: "none",
    border: `1px solid ${C.brass}66`,
    color: C.creamSoft,
    borderRadius: 4,
    width: 24,
    height: 24,
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
  };

  return (
    <div style={frame} onPointerDown={onFocus}>
      <div style={titleBar} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <span
          style={{
            fontFamily: FONTS.heading,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1,
            color: C.brassBright,
          }}
        >
          {title}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          {onMinimize && (
            <button onClick={onMinimize} title="Minimera till taskbaren" style={winBtn}>
              —
            </button>
          )}
          <button onClick={onClose} title="Close (Esc)" style={winBtn}>
            ✕
          </button>
        </span>
      </div>
      <div style={{ overflowY: "auto", padding: 16 }}>{children}</div>
    </div>
  );
}
