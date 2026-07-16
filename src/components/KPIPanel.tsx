import { useState } from "react";
import { DISTRICTS } from "../engine/data";
import { loanTerms } from "../engine/finance";
import { kr, pct } from "../engine/format";
import { propInvestedCost, propMarketValue, propNOI } from "../engine/property";
import type { GameAction, GameState } from "../engine/types";
import { BURGUNDY, C, FONTS, THEME } from "../styles/tokens";

interface Props {
  state: GameState;
  dispatch: (a: GameAction) => void;
}

const card: React.CSSProperties = {
  background: THEME.parchment,
  border: `1px solid ${C.brass}`,
  borderRadius: 6,
  padding: 16,
  color: C.ink,
};

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: C.inkSoft, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: FONTS.heading, color: color ?? C.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function KPIPanel({ state, dispatch: _dispatch }: Props) {
  const [stressRate, setStressRate] = useState(2);
  const [stressVacancy, setStressVacancy] = useState(10);

  const completedProps = state.portfolio.filter((p) => p.status === "klar");
  const totalValue = completedProps.reduce((a, p) => a + propMarketValue(p, state), 0);
  const totalNOI = completedProps.reduce((a, p) => a + propNOI(p, state), 0);
  const terms = loanTerms(state);
  const annualInterest = state.debt * (terms.rate / 100);
  const totalRent = completedProps.reduce((a, p) => a + p.tenants.reduce((b, t) => b + t.rent * 12, 0), 0);
  const totalCapacity = completedProps.reduce((a, p) => a + p.capacity, 0);
  const totalTenants = completedProps.reduce((a, p) => a + p.tenants.length, 0);
  const occupancyRate = totalCapacity > 0 ? totalTenants / totalCapacity : 0;
  const capRate = totalValue > 0 ? (totalNOI / totalValue) * 100 : 0;
  const dscr = annualInterest > 0 ? totalNOI / annualInterest : Infinity;
  const grossYield = totalValue > 0 ? (totalRent / totalValue) * 100 : 0;
  // Yield on cost: NOI mot investerat kapital (inköp + förbättringar/omkostnader).
  const totalInvested = completedProps.reduce((a, p) => a + propInvestedCost(p), 0);
  const yieldOnCost = totalInvested > 0 ? (totalNOI / totalInvested) * 100 : 0;

  // Per-district KPIs
  const districtKPIs = DISTRICTS.map((d) => {
    const dProps = completedProps.filter((p) => p.district === d.id);
    const dValue = dProps.reduce((a, p) => a + propMarketValue(p, state), 0);
    const dNOI = dProps.reduce((a, p) => a + propNOI(p, state), 0);
    const dCapRate = dValue > 0 ? (dNOI / dValue) * 100 : 0;
    const dOcc = dProps.length > 0 ? dProps.reduce((a, p) => a + p.tenants.length, 0) / dProps.reduce((a, p) => a + p.capacity, 0) : 0;
    return { d, count: dProps.length, value: dValue, noi: dNOI, capRate: dCapRate, occ: dOcc };
  }).filter((x) => x.count > 0);

  // Stress test
  const stressInterest = state.debt * ((terms.rate + stressRate) / 100);
  const stressVacancyLoss = totalRent * (stressVacancy / 100);
  const stressNOI = totalNOI - stressVacancyLoss;
  const stressCashflow = stressNOI - stressInterest;

  const dscrColor = dscr >= 1.5 ? C.green : dscr >= 1.2 ? C.gold : C.negative;
  const capColor = capRate >= 6 ? C.green : capRate >= 4 ? C.gold : C.negative;

  return (
    <div style={{ color: C.parchment, fontFamily: FONTS.body }}>
      <h2 style={{ fontFamily: FONTS.heading, color: C.brassBright, marginBottom: 16 }}>KPI dashboard</h2>

      {/* Key metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KPICard label="Yield on cost" value={`${yieldOnCost.toFixed(2)}%`} sub="NOI / invested capital" color={yieldOnCost >= 6 ? C.green : yieldOnCost >= 4 ? C.gold : C.negative} />
        <KPICard label="Cap rate" value={`${capRate.toFixed(2)}%`} sub="NOI / market value" color={capColor} />
        <KPICard label="Gross yield" value={`${grossYield.toFixed(2)}%`} sub="Gross rent / value" color={C.ink} />
        <KPICard label="DSCR" value={isFinite(dscr) ? dscr.toFixed(2) : "∞"} sub="NOI / interest cost" color={dscrColor} />
        <KPICard label="Occupancy" value={pct(occupancyRate)} sub={`${totalTenants} / ${totalCapacity} units`} color={occupancyRate >= 0.85 ? C.green : C.gold} />
        <KPICard label="NOI / yr" value={kr(totalNOI)} sub="Net operating income" color={totalNOI > 0 ? C.green : C.negative} />
        <KPICard label="Cash flow / yr" value={kr(totalNOI - annualInterest)} sub="NOI − interest" color={(totalNOI - annualInterest) > 0 ? C.green : C.negative} />
      </div>

      {/* District breakdown */}
      {districtKPIs.length > 0 && (
        <>
          <h3 style={{ fontFamily: FONTS.heading, color: C.brassBright, fontSize: 15, marginBottom: 10 }}>Per district</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 24 }}>
            {districtKPIs.map(({ d, count, noi, capRate: cr, occ }) => (
              <div key={d.id} style={{ background: C.wood, border: `1px solid ${C.brass}44`, borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, color: C.brassBright, marginBottom: 6 }}>{d.name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px", fontSize: 12 }}>
                  <span style={{ color: C.creamSoft }}>Assets:</span><span>{count}</span>
                  <span style={{ color: C.creamSoft }}>NOI:</span><span>{kr(noi)}/yr</span>
                  <span style={{ color: C.creamSoft }}>Cap rate:</span>
                  <span style={{ color: cr >= 5 ? C.positive : cr >= 3 ? C.gold : C.negative }}>{cr.toFixed(1)}%</span>
                  <span style={{ color: C.creamSoft }}>Occupancy:</span>
                  <span style={{ color: occ >= 0.85 ? C.positive : C.gold }}>{pct(occ)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Stress test */}
      <div style={{ background: C.wood, border: `1px solid ${C.brass}`, borderRadius: 6, padding: 16 }}>
        <h3 style={{ fontFamily: FONTS.heading, color: C.brassBright, fontSize: 15, marginBottom: 12 }}>
          Stress test — "What happens if…"
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Rate rises: +{stressRate.toFixed(1)}%</label>
            <input type="range" min={0} max={5} step={0.5} value={stressRate}
              onChange={(e) => setStressRate(+e.target.value)}
              style={{ width: "100%", accentColor: BURGUNDY, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: C.creamSoft }}>Vacancy rises: +{stressVacancy}%</label>
            <input type="range" min={0} max={30} step={5} value={stressVacancy}
              onChange={(e) => setStressVacancy(+e.target.value)}
              style={{ width: "100%", accentColor: BURGUNDY, marginTop: 4 }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { l: "Stress NOI", v: kr(stressNOI), c: stressNOI > 0 ? C.positive : C.negative },
            { l: "Stress interest", v: kr(stressInterest), c: C.negative },
            { l: "Stress cash flow", v: kr(stressCashflow), c: stressCashflow > 0 ? C.positive : C.negative },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ textAlign: "center", background: "#1a1208", borderRadius: 5, padding: "10px 8px" }}>
              <div style={{ fontSize: 10, color: C.creamSoft, marginBottom: 3 }}>{l}</div>
              <div style={{ fontWeight: 700, color: c, fontSize: 15 }}>{v}</div>
            </div>
          ))}
        </div>
        {stressCashflow < 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.negative, fontWeight: 700 }}>
            ⚠ Under these conditions cash flow is negative by {kr(Math.abs(stressCashflow))}/yr.
          </div>
        )}
      </div>
    </div>
  );
}
