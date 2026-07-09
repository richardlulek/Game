/* ============================================================
   Spelklockan – driver dagsticks med fast tidssteg.
   requestAnimationFrame mäter verklig tid; en ackumulator avgör
   när nästa DAG tickas. Kalendern rullar dag för dag för mjukt
   flöde, medan den tunga ekonomin fortfarande räknas per månad
   (advanceMonth körs vid månadsskifte inuti advanceDay). En månad
   tar lika lång verklig tid oavsett längd: dagssteget är MONTH_MS
   delat med antalet dagar i den aktuella månaden. dt klipps till max
   100 ms, vilket gör att en dold flik inte ger "catch-up". Klockan
   pausar sig själv vid game over, vinst och väntande beslut.
   ============================================================ */

import { useEffect } from "react";
import { daysInMonth } from "../engine/date";
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
      return st.gameOver || !!st.gameWon || !!st.pendingDecision || !!st.auction;
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
      let yearRolled = false;
      // Dagssteget beror på aktuell månadslängd så varje månad tar MONTH_MS.
      let dayMs = MONTH_MS / daysInMonth(
        useGameStore.getState().state.year,
        useGameStore.getState().state.month,
      );
      while (acc >= dayMs && !blocked()) {
        acc -= dayMs;
        const prevYear = useGameStore.getState().state.year;
        useGameStore.getState().dispatch({ type: "NEXT_DAY" });
        ticked = true;
        const st = useGameStore.getState().state;
        if (st.year !== prevYear) yearRolled = true;
        dayMs = MONTH_MS / daysInMonth(st.year, st.month);
      }
      if (ticked) {
        const store = useGameStore.getState();
        // Autospar EN gång per spelår (inte varje dag/månad – serialiseringen
        // av hela tillståndet till localStorage gav ett märkbart hack varje
        // tick). Viktiga stopp sparas alltid direkt nedan.
        if (yearRolled) store.save();
        if (blocked()) {
          store.save();
          store.setRunning(false);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Fångstnät: spara när fliken stängs/döljs så inga månader tappas.
    const onHide = () => useGameStore.getState().save();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [running, speed]);
}
