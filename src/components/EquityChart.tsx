import { msek } from "../engine/format";
import type { HistoryPoint } from "../engine/types";
import { BURGUNDY, C, FONTS } from "../styles/tokens";

interface EquityChartProps {
  history: HistoryPoint[];
}

/** Unikt id för gradienten så flera diagram kan samexistera utan id-krock. */
const AREA_GRAD_ID = "fi-equity-area";

export function EquityChart({ history }: EquityChartProps) {
  if (history.length < 2) return null;
  const w = 600,
    h = 110,
    pad = 4;
  const vals = history.map((d) => d.equity);
  const min = Math.min(...vals),
    max = Math.max(...vals),
    range = max - min || 1;
  const pts = history.map((d, i) => {
    const x = pad + (i / (history.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((d.equity - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  // Slutet polygon för ytfyllningen: linjen + nedre kanten tillbaka.
  const area = `${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`;
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 110 }}>
        <defs>
          <linearGradient id={AREA_GRAD_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brass} stopOpacity={0.28} />
            <stop offset="100%" stopColor={C.brass} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${AREA_GRAD_ID})`} stroke="none" />
        <polyline points={pts.join(" ")} fill="none" stroke={C.brass} strokeWidth="2.5" />
      </svg>
      <div style={{ fontSize: 12, color: C.inkSoft }}>
        Eget kapital över tid · senaste:{" "}
        <strong style={{ fontFamily: FONTS.heading, color: BURGUNDY }}>{msek(vals[vals.length - 1])}</strong>
      </div>
    </div>
  );
}
