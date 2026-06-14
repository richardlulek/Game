import { kr, msek, pct } from "../engine/format";
import type { GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";
import { AnimatedNumber } from "./AnimatedNumber";

interface StatusBarProps {
  state: GameState;
  equity: number;
  ltv: number;
  terms: LoanTerms;
  monthlyNOI: number;
  monthlyInterest: number;
  myRank: number;
}

function Chip({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={S.statusChip}>
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

export function StatusBar({ state, equity, ltv, terms, monthlyNOI, monthlyInterest, myRank }: StatusBarProps) {
  const cashFlow = monthlyNOI - monthlyInterest;
  const rankColor = myRank === 1 ? "#ffd700" : undefined;

  return (
    <div style={S.statusBar}>
      <NumChip label="Kassa" value={state.cash} format={msek} valueColor={state.cash < 0 ? "#f87a7a" : "#80e080"} />
      <NumChip label="Eget kapital" value={equity} format={msek} />
      <NumChip label="Skuld" value={state.debt} format={msek} />
      <Chip label="LTV" value={pct(ltv)} />
      <NumChip label="Kassaflöde/mån" value={cashFlow} format={kr} valueColor={cashFlow >= 0 ? "#80e080" : "#f87a7a"} />
      <Chip label="Ränta" value={terms.rate + " %"} />
      <Chip label="Reputation" value={String(Math.round(state.reputation))} />
      <Chip label="Rank" value={`#${myRank}`} valueColor={rankColor} />
    </div>
  );
}
