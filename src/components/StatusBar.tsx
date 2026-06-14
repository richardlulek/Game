import { kr, msek, pct } from "../engine/format";
import type { GameState, LoanTerms } from "../engine/types";
import { S } from "../styles/styles";

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

export function StatusBar({ state, equity, ltv, terms, monthlyNOI, monthlyInterest, myRank }: StatusBarProps) {
  const cashFlow = monthlyNOI - monthlyInterest;
  const rankColor = myRank === 1 ? "#ffd700" : undefined;

  return (
    <div style={S.statusBar}>
      <Chip label="Kassa" value={msek(state.cash)} valueColor={state.cash < 0 ? "#f87a7a" : "#80e080"} />
      <Chip label="Eget kapital" value={msek(equity)} />
      <Chip label="Skuld" value={msek(state.debt)} />
      <Chip label="LTV" value={pct(ltv)} />
      <Chip label="Kassaflöde/mån" value={kr(cashFlow)} valueColor={cashFlow >= 0 ? "#80e080" : "#f87a7a"} />
      <Chip label="Ränta" value={terms.rate + " %"} />
      <Chip label="Reputation" value={String(Math.round(state.reputation))} />
      <Chip label="Rank" value={`#${myRank}`} valueColor={rankColor} />
    </div>
  );
}
