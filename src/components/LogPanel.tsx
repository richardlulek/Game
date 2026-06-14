import type { LogEntry } from "../engine/types";
import { S } from "../styles/styles";
import { logColor } from "./logColor";

interface LogPanelProps {
  log: LogEntry[];
}

export function LogPanel({ log }: LogPanelProps) {
  return (
    <div style={S.logBox}>
      {log.map((l, i) => (
        <div key={i} style={{ ...S.logItem, color: logColor(l.kind) }}>
          {l.t}
        </div>
      ))}
    </div>
  );
}
