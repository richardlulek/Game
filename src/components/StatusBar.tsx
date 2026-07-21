import { OVERLOAD_COST_PER_PROP, orgLoadOf, tierForLevel } from "../engine/company";
import { kr, msek, pct } from "../engine/format";
import type { GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";
import { AnimatedNumber } from "./AnimatedNumber";
import { hotelMonthlyRevenue, hotelMonthlyOpex, energyMonthlyRevenue, energyMonthlyOpex, logisticsMonthlyRevenue, logisticsMonthlyOpex } from "../engine/industries";

interface StatusBarProps {
  state: GameState;
  equity: number;
  ltv: number;
  terms: LoanTerms;
  monthlyNOI: number;
  monthlyInterest: number;
  myRank: number;
}

function Chip({ label, value, valueColor, title }: { label: string; value: string; valueColor?: string; title?: string }) {
  return (
    <div style={S.statusChip} title={title}>
      <div style={S.statusLabel}>{label}</div>
      <div style={{ ...S.statusValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</div>
    </div>
  );
}

function NumChip({ label, value, format, valueColor }: {
  label: string; value: number; format: (n: number) => string; valueColor?: string;
}) {
  return (
    <div style={S.statusChip}>
      <div style={S.statusLabel}>{label}</div>
      <AnimatedNumber
        value={value}
        format={format}
        style={{ ...S.statusValue, ...(valueColor ? { color: valueColor } : {}) }}
      />
    </div>
  );
}

function calcIndustryNOI(state: GameState): number {
  return (state.industryPortfolio ?? []).reduce((sum, a) => {
    if (a.status !== "klar") return sum;
    if (a.sector === "hotell")   return sum + hotelMonthlyRevenue(a, state) - hotelMonthlyOpex(a, state);
    if (a.sector === "energi")   return sum + energyMonthlyRevenue(a, state) - energyMonthlyOpex(a, state);
    if (a.sector === "logistik") return sum + logisticsMonthlyRevenue(a, state) - logisticsMonthlyOpex(a, state);
    return sum;
  }, 0);
}

export function StatusBar({ state, equity, ltv, terms, monthlyNOI, monthlyInterest, myRank }: StatusBarProps) {
  const cashFlow = monthlyNOI - monthlyInterest;
  const rankColor = myRank === 1 ? "#ffd700" : undefined;
  const ltvColor = ltv > 0.85 ? "#f87a7a" : ltv > 0.75 ? "#f5c842" : ltv > 0.60 ? "#e0c050" : undefined;
  const nowAbs = state.year * 12 + state.month;
  const monthsToMaturity = state.debtMatureAbs ? state.debtMatureAbs - nowAbs : null;
  // Tydlig, alltid korrekt husräkning – till skillnad från "Organisation" som
  // faller mot 0 så fort fastigheterna får förvaltare. Här räknas hela beståndet.
  const ownedHouses = state.portfolio.filter((p) => p.status === "klar").length;
  const buildingHouses = state.portfolio.length - ownedHouses;

  return (
    <div style={S.statusBar}>
      <NumChip label="Cash" value={state.cash} format={msek} valueColor={state.cash < -200_000 ? "#f87a7a" : state.cash < 0 ? "#f5c842" : "#80e080"} />
      {state.portfolio.length > 0 && (
        <Chip
          label="Properties"
          value={buildingHouses > 0 ? `${ownedHouses} 🏠 (+${buildingHouses} 🏗️)` : `${ownedHouses} 🏠`}
        />
      )}
      <NumChip label="Equity" value={equity} format={msek} />
      <NumChip label="Debt" value={state.debt} format={msek} />
      <Chip label="LTV" value={pct(ltv)} valueColor={ltvColor} />
      {state.debt > 0 && monthsToMaturity !== null && monthsToMaturity <= 12 && (
        <Chip label="Loan due" value={`${monthsToMaturity} mo`} valueColor={monthsToMaturity <= 6 ? "#f87a7a" : "#f5c842"} />
      )}
      <NumChip label="Cash flow/mo" value={cashFlow} format={kr} valueColor={cashFlow >= 0 ? "#80e080" : "#f87a7a"} />
      <Chip label="Rate" value={terms.rate + "%"} />
      <Chip label="Reputation" value={String(Math.round(state.reputation))} />
      <Chip label="Rank" value={`#${myRank}`} valueColor={rankColor} />
      <Chip label="Company" value={`${tierForLevel(state.companyLevel ?? 1).icon} Level ${state.companyLevel ?? 1}`} />
      {state.portfolio.length > 0 && (() => {
        // Organisationsbelastning, inte "antal förvaltade": chippen räknar
        // fastigheter du sköter SJÄLV mot nivåns tak. 0/30 med 69 hus betyder
        // alltså att förvaltare/direktören täcker allt – tidigare etiketten
        // "Management" lästes som motsatsen (uppfattades som bugg).
        const load = orgLoadOf(state);
        const director = state.globalManager?.active;
        return (
          <Chip
            label="Self-managed"
            value={director ? "🎩 Director" : `${load.selfManaged}/${load.cap}`}
            valueColor={load.over > 0 ? "#f87a7a" : undefined}
            title={
              director
                ? "The portfolio director's office manages the entire portfolio — nothing burdens your own organisation."
                : `Properties without a property manager burden your own organisation: ${load.selfManaged} of ${load.cap} capacity at level ${state.companyLevel ?? 1}.${load.over > 0 ? ` Over capacity: +${kr(load.over * OVERLOAD_COST_PER_PROP)}/mo in admin costs.` : ""}`
            }
          />
        );
      })()}
      {state.marketMod < 0.97 && (
        <Chip label="Market" value={`${((state.marketMod - 1) * 100).toFixed(0)}%`} valueColor="#f87a7a" />
      )}
      {state.marketMod > 1.03 && (
        <Chip label="Market" value={`+${((state.marketMod - 1) * 100).toFixed(0)}%`} valueColor="#80e080" />
      )}
      {state.demandMod < 0.97 && (
        <Chip label="Demand" value={`${((state.demandMod - 1) * 100).toFixed(0)}%`} valueColor="#f87a7a" />
      )}
      {(state.recessionMonthsLeft ?? 0) > 0 && (
        <Chip label="Recession" value={`${state.recessionMonthsLeft} mo`} valueColor="#f87a7a" />
      )}
      {state.marketCycle?.phase === "boom" && (
        <Chip label="Cycle" value={`📈 BOOM (${state.marketCycle.monthsRemaining} mo)`} valueColor="#80e080" />
      )}
      {state.marketCycle?.phase === "bust" && (
        <Chip label="Cycle" value={`📉 BUST (${state.marketCycle.monthsRemaining} mo)`} valueColor="#f87a7a" />
      )}
      {(state.pendingRenewals ?? []).length > 0 && (
        <Chip label="Renewals" value={`⏰ ${state.pendingRenewals!.length} leases`} valueColor="#f5c842" />
      )}
      {(state.totalTaxPaid ?? 0) > 0 && (
        <Chip label="Tax this year" value={kr(state.totalTaxPaid ?? 0)} />
      )}
      {state.ipoActive && (state.takeoverPressure ?? 0) > 30 && (
        <Chip
          label="Takeover pressure"
          value={`${Math.round(state.takeoverPressure ?? 0)}%`}
          valueColor={(state.takeoverPressure ?? 0) >= 75 ? "#f87a7a" : "#f5c842"}
        />
      )}
      {(state.industryPortfolio ?? []).length > 0 && (() => {
        const noi = calcIndustryNOI(state);
        return (
          <NumChip label="Industry NOI/mo" value={noi} format={kr} valueColor={noi >= 0 ? "#80e080" : "#f87a7a"} />
        );
      })()}
    </div>
  );
}
