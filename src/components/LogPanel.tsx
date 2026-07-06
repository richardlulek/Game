import type { LogEntry } from "../engine/types";
import { S } from "../styles/styles";
import { logColor } from "./logColor";

interface LogPanelProps {
  log: LogEntry[];
  /** Anropas med parcelId när en rad med plats klickas – visa på kartan. */
  onLocate?: (parcelId: string) => void;
}

export function LogPanel({ log, onLocate }: LogPanelProps) {
  return (
    <div style={S.logBox}>
      {log.map((l, i) => {
        const locatable = !!(l.parcelId && onLocate);
        return (
          <div
            key={i}
            style={{
              ...S.logItem,
              color: logColor(l.kind),
              cursor: locatable ? "pointer" : "default",
            }}
            title={locatable ? "Visa på kartan" : undefined}
            onClick={locatable ? () => onLocate!(l.parcelId!) : undefined}
          >
            {locatable && <span style={{ marginRight: 4 }}>📍</span>}
            {l.t}
          </div>
        );
      })}
    </div>
  );
}
