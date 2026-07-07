import type { CSSProperties } from "react";
import type { ClockSpeed } from "../store/gameStore";
import { useGameStore } from "../store/gameStore";
import { BURGUNDY } from "../styles/tokens";

const C: Record<string, CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 5 },
  play: {
    background: BURGUNDY,
    color: "#fff",
    border: "none",
    padding: "7px 13px",
    borderRadius: 7,
    fontWeight: 700,
    fontSize: 13,
    minWidth: 82,
    cursor: "pointer",
  },
  speed: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.25)",
    padding: "6px 9px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 700,
    color: "#ddd",
    cursor: "pointer",
  },
  speedActive: { background: "#e8e2d6", color: "#1a1a1a", border: "1px solid #e8e2d6" },
};

const SPEEDS: ClockSpeed[] = [1, 2, 4];

/** Paus/play och hastighet för den rullande spelklockan. */
export function ClockControls() {
  const { running, speed } = useGameStore((s) => s.clock);
  const setRunning = useGameStore((s) => s.setRunning);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const blocked = useGameStore(
    (s) => s.state.gameOver || !!s.state.gameWon || !!s.state.pendingDecision,
  );

  return (
    <div style={C.wrap}>
      <button
        style={{ ...C.play, ...(blocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
        disabled={blocked}
        onClick={() => setRunning(!running)}
        title="Rullande tid: månaderna tickar av sig själva"
      >
        {running ? "❚❚ Paus" : "► Spela"}
      </button>
      {SPEEDS.map((v) => (
        <button
          key={v}
          style={{ ...C.speed, ...(speed === v ? C.speedActive : {}) }}
          disabled={blocked}
          onClick={() => setSpeed(v)}
        >
          {v}×
        </button>
      ))}
    </div>
  );
}
