/* ============================================================
   IndustryPanel – portföljvy för industritillgångar.
   Filtrerbar per sektor; visar NOI-summering överst.
   ============================================================ */

import { useState } from "react";
import type { GameAction, GameState, IndustryAsset, IndustrySectorKey } from "../engine/types";
import { IndustryCard } from "./IndustryCard";
import { kr } from "../engine/format";
import {
  hotelMonthlyRevenue, hotelMonthlyOpex,
  energyMonthlyRevenue, energyMonthlyOpex,
  logisticsMonthlyRevenue, logisticsMonthlyOpex,
  synergySummary,
} from "../engine/industries";
import { S } from "../styles/styles";
import { C, FONTS } from "../styles/tokens";

const SECTOR_FILTERS: { id: IndustrySectorKey | "alla"; label: string }[] = [
  { id: "alla",     label: "Alla" },
  { id: "hotell",   label: "🏨 Hotell" },
  { id: "energi",   label: "⚡ Energi" },
  { id: "logistik", label: "📦 Logistik" },
];

function calcNOI(asset: IndustryAsset, state: GameState): number {
  if (asset.status !== "klar") return 0;
  if (asset.sector === "hotell")   return hotelMonthlyRevenue(asset, state) - hotelMonthlyOpex(asset, state);
  if (asset.sector === "energi")   return energyMonthlyRevenue(asset, state) - energyMonthlyOpex(asset, state);
  if (asset.sector === "logistik") return logisticsMonthlyRevenue(asset, state) - logisticsMonthlyOpex(asset, state);
  return 0;
}

const filterBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 4,
  border: `1px solid ${active ? C.brass : C.brassDim + "88"}`,
  background: active ? C.wood : "transparent",
  color: active ? C.brassBright : C.inkSoft,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: FONTS.body,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

export function IndustryPanel({ state, dispatch }: Props) {
  const [sector, setSector] = useState<IndustrySectorKey | "alla">("alla");

  const portfolio = state.industryPortfolio ?? [];

  const filtered = sector === "alla"
    ? portfolio
    : portfolio.filter((a) => a.sector === sector);

  const totalNOI    = portfolio.reduce((s, a) => s + calcNOI(a, state), 0);
  const hotelNOI    = portfolio.filter((a) => a.sector === "hotell").reduce((s, a) => s + calcNOI(a, state), 0);
  const energiNOI   = portfolio.filter((a) => a.sector === "energi").reduce((s, a) => s + calcNOI(a, state), 0);
  const logistikNOI = portfolio.filter((a) => a.sector === "logistik").reduce((s, a) => s + calcNOI(a, state), 0);

  if (portfolio.length === 0) {
    return (
      <div style={S.empty}>
        No industry assets yet. Go to <strong>Ind. Market</strong> to acquire hotels,
        energy plants or logistics centers.
      </div>
    );
  }

  return (
    <div>
      {/* NOI-summering */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        marginBottom: 18,
        padding: "14px 16px",
        background: "linear-gradient(165deg, #eef2f7, #d6dfeb)",
        border: `1px solid ${C.brass}`,
        borderRadius: 6,
      }}>
        {[
          { label: "Total NOI/mo", val: totalNOI },
          { label: "🏨 Hotell",     val: hotelNOI },
          { label: "⚡ Energi",     val: energiNOI },
          { label: "📦 Logistik",   val: logistikNOI },
        ].map(({ label, val }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: C.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 15, color: val >= 0 ? C.positive : "#b83030" }}>{kr(val)}</div>
          </div>
        ))}
      </div>

      {/* Synergier med fastighetsbeståndet – industrierna är del av staden */}
      {synergySummary(state).length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          border: `1px solid ${C.brassDim}`,
          borderRadius: 6,
          background: "rgba(201,164,92,0.08)",
        }}>
          <div style={{ fontSize: 10, color: C.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Active synergies with the property portfolio
          </div>
          {synergySummary(state).map((row) => (
            <div key={row} style={{ fontSize: 12.5, padding: "2px 0", color: C.ink }}>{row}</div>
          ))}
        </div>
      )}

      {/* Sektorfilter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {SECTOR_FILTERS.map((f) => (
          <button key={f.id} style={filterBtn(sector === f.id)} onClick={() => setSector(f.id)}>
            {f.label}{" "}
            <span style={{ opacity: 0.7 }}>
              ({f.id === "alla" ? portfolio.length : portfolio.filter((a) => a.sector === f.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Kort */}
      <div style={S.grid}>
        {filtered.length === 0 && (
          <div style={S.empty}>No assets in that sector.</div>
        )}
        {filtered.map((a) => (
          <IndustryCard key={a.id} asset={a} state={state} dispatch={dispatch} />
        ))}
      </div>
    </div>
  );
}
