/* ============================================================
   Delat UI-bibliotek – återanvändbara primitiver som ger hela
   spelet ett enhetligt utseende. Extraherat från börsens
   kvalitetsribba och byggt helt på designtokens (inga hårdkodade
   färger). Importera härifrån i stället för att duplicera kort,
   knappar, chips och nyckeltal i varje panel.
   ============================================================ */

import type { CSSProperties, ReactNode } from "react";
import { BURGUNDY, C, FONTS, THEME } from "../../styles/tokens";

// ── Färg-/trendhjälpare ─────────────────────────────────────────────────

/** Grön för ≥0, röd annars. */
export const trendColor = (v: number) => (v >= 0 ? C.positive : C.negative);
/** "+3.2 %" / "−1.4 %" från en andel (0.032). */
export const signed = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + " %";

// ── Kort ────────────────────────────────────────────────────────────────

export const cardStyle: CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 8,
  padding: 16,
  color: C.ink,
  boxShadow: `${THEME.insetGold}, 0 6px 18px rgba(0,0,0,0.35)`,
};

export function Card({ children, style, onClick, className }: { children: ReactNode; style?: CSSProperties; onClick?: () => void; className?: string }) {
  return (
    <div className={className} onClick={onClick} style={{ ...cardStyle, ...style }}>
      {children}
    </div>
  );
}

/** Tunn guldlinje som avdelare. */
export function GoldRule({ margin = "10px 0" }: { margin?: string }) {
  return <div style={{ height: 2, background: THEME.goldRule, margin }} />;
}

/** Sektionsrubrik på ljust kort (mörk bläcktext, accentfärg). */
export function SectionHeading({ children, size = 18, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <h3 style={{ fontFamily: FONTS.heading, fontWeight: 700, color: BURGUNDY, margin: 0, fontSize: size, letterSpacing: 0.2, ...style }}>
      {children}
    </h3>
  );
}

// ── Nyckeltal ───────────────────────────────────────────────────────────

const subLabelStyle: CSSProperties = {
  fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkSoft, fontWeight: 600,
};

export function SubLabel({ children }: { children: ReactNode }) {
  return <div style={subLabelStyle}>{children}</div>;
}

/** Ett nyckeltal: etikett + värde. */
export function Metric({ label, value, color, sub }: { label: ReactNode; value: ReactNode; color?: string; sub?: ReactNode }) {
  return (
    <div>
      <div style={subLabelStyle}>{label}</div>
      <div style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: 700, color: color ?? C.ink }}>{value}</div>
      {sub !== undefined && <div style={{ fontSize: 11, color: C.inkSoft }}>{sub}</div>}
    </div>
  );
}

/** Responsivt rutnät av nyckeltal. */
export function MetricGrid({ children, min = 130 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 12 }}>{children}</div>;
}

// ── Knappar ─────────────────────────────────────────────────────────────

const btnBase: CSSProperties = {
  borderRadius: 6, fontFamily: FONTS.body, fontWeight: 700, fontSize: 13, letterSpacing: 0.3, cursor: "pointer",
  padding: "8px 14px", transition: "filter 0.12s ease",
};
export const disabledBtnStyle: CSSProperties = { background: C.brassDim, color: C.creamSoft, borderColor: C.brassDim, cursor: "default", opacity: 0.7 };

export function PrimaryButton({ children, onClick, disabled, style, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...btnBase, background: BURGUNDY, color: C.brassBright, border: `1px solid ${C.brass}`, ...(disabled ? disabledBtnStyle : {}), ...style }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled, active, style, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...btnBase, fontWeight: 600,
        background: active ? C.wood : "transparent",
        color: active ? C.brassBright : C.ink,
        border: `1px solid ${active ? C.brass : C.brassDim}`,
        ...(disabled ? disabledBtnStyle : {}), ...style,
      }}
    >
      {children}
    </button>
  );
}

export function StepButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 30, height: 32, background: C.wood, color: C.brassBright, border: `1px solid ${C.brass}`, borderRadius: 6, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>
      {children}
    </button>
  );
}

// ── Chips & märken ───────────────────────────────────────────────────────

/** Filter-/valchip. */
export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 6, border: `1px solid ${active ? C.brass : C.brassDim}`,
        background: active ? BURGUNDY : "transparent", color: active ? C.brassBright : C.ink,
        fontFamily: FONTS.body, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.3,
      }}
    >
      {children}
    </button>
  );
}

/** Litet färgat statusmärke (piller). */
export function Badge({ children, color = BURGUNDY, fg = C.brassBright }: { children: ReactNode; color?: string; fg?: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: color, color: fg, padding: "2px 7px", borderRadius: 10, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// ── Tomläge ─────────────────────────────────────────────────────────────

export function EmptyState({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div style={{ ...cardStyle, textAlign: "center", color: C.inkSoft, fontSize: 14, padding: 24 }}>
      {icon && <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.7 }}>{icon}</div>}
      {children}
    </div>
  );
}

// ── Sparkline & flash ─────────────────────────────────────────────────────

export function Sparkline({ data, width = 92, height = 26, color }: { data: number[]; width?: number; height?: number; color: string }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
      const y = height - pad - ((v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Områdesgraf med fylld yta (detaljvyer). */
export function AreaChart({ data, height = 120, color, empty = "Not enough history yet." }: { data: number[]; height?: number; color: string; empty?: string }) {
  const width = 520;
  if (!data || data.length < 2) return <div style={{ width: "100%", height, color: C.inkSoft, fontSize: 12 }}>{empty}</div>;
  const pad = 6;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xy = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
    const y = height - pad - ((v - min) / range) * (height - 2 * pad);
    return [x, y] as const;
  });
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${(width - pad).toFixed(1)},${height - pad}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** Kursflash: grön/röd puls när värdet ändras. */
export function FlashCell({ value, prev, children }: { value: number; prev: number; children: ReactNode }) {
  const dir = value > prev ? "up" : value < prev ? "down" : "flat";
  return (
    <span
      key={value}
      style={{
        display: "inline-block", borderRadius: 3, padding: "0 3px",
        animation: dir === "up" ? "flashUp 0.6s ease-out" : dir === "down" ? "flashDown 0.6s ease-out" : undefined,
      }}
    >
      {children}
    </span>
  );
}
