/* ============================================================
   Skapar tillfälliga kartmarkörer för nya logghändelser som har
   en plats (parcelId). Diffar loggen mot förra huvudet – vid
   load/reset känns huvudet inte igen och inga markörer skapas.
   ============================================================ */

import { useEffect, useRef } from "react";
import type { LogEntry } from "../engine/types";
import { useGameStore } from "../store/gameStore";
import { useUiStore } from "../store/uiStore";

export function useEventMarkers(): void {
  const log = useGameStore((s) => s.state.log);
  const addMarker = useUiStore((s) => s.addMarker);
  const prevHead = useRef<LogEntry | null>(null);

  useEffect(() => {
    const prev = prevHead.current;
    prevHead.current = log[0] ?? null;
    if (!prev) return; // första rendern
    const fresh: LogEntry[] = [];
    for (const e of log) {
      if (e === prev) break;
      fresh.push(e);
    }
    if (fresh.length === log.length) return; // load/reset – hela loggen "ny"
    for (const e of fresh) if (e.parcelId) addMarker(e.parcelId, e.kind);
  }, [log, addMarker]);
}
