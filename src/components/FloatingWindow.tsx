import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { C, FONTS, THEME } from "../styles/tokens";

/**
 * Flytande, dragbart fönster ovanpå stadskartan – à la Capitalism 2,
 * där kartan alltid är världen och rapporter/paneler öppnas i fönster.
 * Dra i titelraden för att flytta; ✕ eller Esc stänger.
 */
export function FloatingWindow({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState({ x: 14, y: 10 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
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
    zIndex: 50,
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

  return (
    <div style={frame}>
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
        <button
          onClick={onClose}
          title="Stäng (Esc)"
          style={{
            background: "none",
            border: `1px solid ${C.brass}66`,
            color: C.creamSoft,
            borderRadius: 4,
            width: 24,
            height: 24,
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ overflowY: "auto", padding: 16 }}>{children}</div>
    </div>
  );
}
