import type { LogKind } from "../engine/types";
import { BURGUNDY } from "../styles/tokens";

/** Färgkodar en loggrad efter dess typ. */
export function logColor(k: LogKind): string {
  return (
    {
      buy: "#1a5a8a",
      sell: "#7a5a00",
      upg: BURGUNDY,
      income: "#27660a",
      expense: "#c0392b",
      event: "#5a3a8a",
      warn: "#c0392b",
      info: "#555",
    }[k] || "#333"
  );
}
