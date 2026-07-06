import { msek } from "../engine/format";
import type { HistoryPoint } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

interface EquityChartProps {
  history: HistoryPoint[];
}

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
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 110 }}>
        <polyline points={pts.join(" ")} fill="none" stroke={BURGUNDY} strokeWidth="2.5" />
      </svg>
      <div style={{ fontSize: 12, color: "#666" }}>
        Eget kapital över tid · senaste: <strong>{msek(vals[vals.length - 1])}</strong>
      </div>
    </div>
  );
}
