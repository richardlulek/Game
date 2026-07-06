import type { ReactNode } from "react";
import { S } from "../styles/styles";

interface LineProps {
  l: ReactNode;
  v: ReactNode;
  bold?: boolean;
  accent?: string;
}

export function Line({ l, v, bold, accent }: LineProps) {
  return (
    <div style={{ ...S.cardRow, fontWeight: bold ? 700 : 400 }}>
      <span>{l}</span>
      <span style={{ color: accent || "#1a1a1a" }}>{v}</span>
    </div>
  );
}
