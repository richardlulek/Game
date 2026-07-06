import type { CSSProperties } from "react";
import type { ClockSpeed } from "../store/gameStore";
import { useGameStore } from "../store/gameStore";
import { BURGUNDY } from "../styles/tokens";

const C: Record<string, CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 6 },
  date: {
    fontSize: 13,
    fontWeight: 700,
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "7px 12px",
    minWidth: 110,
    textAlign: "center",
  },
  play: {
    background: BURGUNDY,
    color: "#fff",
    border: "none",
    padding: "8px 14px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    minWidth: 84,
  },
  speed: {
    background: "#fff",
    border: "1px solid #ddd",
    padding: "7px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#666",
  },
  speedActive: { background: "#1a1a1a", color: "#fff", border: "1px solid #1a1a1a" },
};

const SPEEDS: ClockSpeed[] = [1, 2, 4];

/** Paus/play, hastighet och månadsstegning – ersätter "Nästa månad"-knappen. */
export function ClockControls() {
  const { running, speed } = useGameStore((s) => s.clock);
  const setRunning = useGameStore((s) => s.setRunning);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const dispatch = useGameStore((s) => s.dispatch);
  const month = useGameStore((s) => s.state.month);
  const year = useGameStore((s) => s.state.year);
  const gameOver = useGameStore((s) => s.state.gameOver);

  return (
    <div style={C.wrap}>
      <div style={C.date}>
        Månad {month} · År {year}
      </div>
      <button style={C.play} disabled={gameOver} onClick={() => setRunning(!running)}>
        {running ? "❚❚ Paus" : "► Spela"}
      </button>
      {SPEEDS.map((v) => (
        <button
          key={v}
          style={{ ...C.speed, ...(speed === v ? C.speedActive : {}) }}
          disabled={gameOver}
          onClick={() => setSpeed(v)}
        >
          {v}×
        </button>
      ))}
      <button
        style={C.speed}
        disabled={running || gameOver}
        title="Stega en månad (i pausläge)"
        onClick={() => dispatch({ type: "NEXT_MONTH" })}
      >
        ⏭
      </button>
    </div>
  );
}
