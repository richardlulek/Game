/* ============================================================
   Spelklockan – driver månadsticks med fast tidssteg.
   requestAnimationFrame mäter verklig tid; en ackumulator avgör
   när nästa månad tickas. dt klipps till max 100 ms, vilket gör
   att en dold flik inte ger "catch-up". Klockan pausar sig själv
   vid game over, vinst och väntande beslut (DecisionModal).
   ============================================================ */

import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";

/** Verklig tid per spelmånad vid 1× hastighet. */
export const MONTH_MS = 4000;

export function useGameClock(): void {
  const running = useGameStore((s) => s.clock.running);
  const speed = useGameStore((s) => s.clock.speed);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const blocked = () => {
      const st = useGameStore.getState().state;
      return st.gameOver || !!st.gameWon || !!st.pendingDecision;
    };

    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (blocked()) {
        useGameStore.getState().setRunning(false);
        return;
      }
      acc += dt * speed;
      let ticked = false;
      while (acc >= MONTH_MS && !blocked()) {
        acc -= MONTH_MS;
        useGameStore.getState().dispatch({ type: "NEXT_MONTH" });
        ticked = true;
      }
      if (ticked) {
        const store = useGameStore.getState();
        store.save(); // autospara varje månad
        if (blocked()) {
          store.setRunning(false);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);
}
