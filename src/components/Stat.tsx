import type { ReactNode } from "react";
import { S } from "../styles/styles";

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}

export function Stat({ label, value, sub, accent }: StatProps) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color: accent || "#1a1a1a" }}>{value}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
    </div>
  );
}
