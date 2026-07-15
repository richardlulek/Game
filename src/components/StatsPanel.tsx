/* Statistik – tycoon-spelarens belöning: kurvor över eget kapital
   (mot bästa rival), driftnetto, kassa och portföljvärde, plus
   områdesutvecklingen per distrikt. Ren SVG utan bibliotek. */

import { DISTRICTS } from "../engine/data";
import { msek } from "../engine/format";
import type { GameState } from "../engine/types";
import { BURGUNDY, C, FONTS } from "../styles/tokens";

const W = 460, H = 150, PAD = 8;

function path(values: number[], min: number, max: number): string {
  if (values.length < 2) return "";
  const span = Math.max(1, max - min);
  return values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Chart({ title, series }: {
  title: string;
  series: { label: string; values: number[]; color: string }[];
}) {
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) {
    return (
      <div style={card}>
        <div style={head}>{title}</div>
        <div style={{ fontSize: 12, color: "#888", padding: "24px 0", textAlign: "center" }}>
          Spela några månader så växer kurvan fram.
        </div>
      </div>
    );
  }
  const min = Math.min(0, ...all);
  const max = Math.max(...all) * 1.05 || 1;
  const last = series.map((s) => s.values[s.values.length - 1] ?? 0);
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={head}>{title}</div>
        <div style={{ fontSize: 11.5 }}>
          {series.map((s, i) => (
            <span key={s.label} style={{ marginLeft: 12, color: s.color, fontWeight: 700 }}>
              ● {s.label}: {msek(last[i])}
            </span>
          ))}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Nollinje + kvartslinjer */}
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1={PAD} x2={W - PAD} y1={H - PAD - k * (H - PAD * 2)} y2={H - PAD - k * (H - PAD * 2)}
            stroke="#00000012" />
        ))}
        <line x1={PAD} x2={W - PAD} y1={H - PAD - ((0 - min) / Math.max(1, max - min)) * (H - PAD * 2)}
          y2={H - PAD - ((0 - min) / Math.max(1, max - min)) * (H - PAD * 2)} stroke="#00000022" />
        {series.map((s) => (
          <path key={s.label} d={path(s.values, min, max)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
      </svg>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#f7f5ee", border: `1px solid ${C.brass}`, borderRadius: 8,
  padding: "10px 14px", color: "#1a1a1a",
};
const head: React.CSSProperties = {
  fontFamily: FONTS.heading, fontWeight: 700, fontSize: 14, color: BURGUNDY,
};

export function StatsPanel({ state }: { state: GameState }) {
  const hist = state.statsHistory ?? [];
  const eq = hist.map((h) => h.equity);
  const rival = hist.map((h) => h.bestRival);
  const noi = hist.map((h) => h.noi);
  const cash = hist.map((h) => h.cash);
  const port = hist.map((h) => h.portfolio);
  const dev = DISTRICTS.map((d) => ({ d, v: state.districtDev?.[d.id] ?? 1 }));
  const maxDev = Math.max(1.05, ...dev.map((x) => x.v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Chart title="Eget kapital mot bästa rival" series={[
        { label: "Du", values: eq, color: BURGUNDY },
        { label: "Bästa rival", values: rival, color: "#3d6db3" },
      ]} />
      <Chart title="Driftnetto per månad" series={[{ label: "NOI", values: noi, color: "#22a06b" }]} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Chart title="Kassa" series={[{ label: "Kassa", values: cash, color: "#c07f16" }]} />
        <Chart title="Portföljvärde" series={[{ label: "Fastigheter", values: port, color: "#4757c8" }]} />
      </div>
      <div style={card}>
        <div style={head}>Områdesutveckling per distrikt</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
          {dev.map(({ d, v }) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 120 }}>{d.name}</span>
              <div style={{ flex: 1, height: 10, background: "#e4dfd2", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (v / maxDev) * 100)}%`, height: "100%", background: v >= 1 ? "#22a06b" : "#c0392b" }} />
              </div>
              <span style={{ width: 52, textAlign: "right", fontWeight: 700 }}>{Math.round(v * 100)} %</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          Kurvorna täcker de senaste {hist.length} månaderna.
        </div>
      </div>
    </div>
  );
}
