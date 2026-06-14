import { S } from "../styles/styles";

interface CondBarProps {
  c: number;
}

export function CondBar({ c }: CondBarProps) {
  return (
    <span style={S.condBar}>
      <span
        style={{
          ...S.condFill,
          width: `${c}%`,
          background: c >= 75 ? "#27660a" : c >= 50 ? "#c8a200" : "#c0392b",
        }}
      />
      <em style={S.condText}>{Math.round(c)}</em>
    </span>
  );
}
