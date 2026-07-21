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
export const MONTH_MS = 8000;
/** Takten när ⏭ Månad spolar fram till månadsskiftet (dagarna rullar synligt). */
const ROLL_SPEED = 8;
/** Minsta realtid mellan autospar. Sparar vid varje månadsskifte men aldrig
 *  oftare än så här – vid hög hastighet/spolning kan flera månader passera per
 *  sekund, och att serialisera hela tillståndet varje gång skulle hacka. */
export const SAVE_THROTTLE_MS = 2500;

/** Ska ett autospar ske nu? Ren funktion (testbar utan rAF-loopen): spara vid
 *  månadsskifte, men aldrig oftare än strypgränsen. */
export function shouldAutosave(monthRolled: boolean, now: number, lastSaveAt: number): boolean {
  return monthRolled && now - lastSaveAt >= SAVE_THROTTLE_MS;
}

export function useGameClock(): void {
  const running = useGameStore((s) => s.clock.running);
  const speed = useGameStore((s) => s.clock.speed);
  const until = useGameStore((s) => s.clock.until);

  // Fångstnät: spara när fliken stängs/döljs – ALLTID, inte bara medan
  // klockan rullar. Tidigare låg lyssnaren i klockeffekten nedan och
  // registrerades bara när klockan var igång, så allt spelaren gjorde i
  // pausat läge (köp, försäljningar, beslut …) gick förlorat om appen
  // stängdes – pengar och fastighetsantal "hoppade tillbaka" vid nästa
  // laddning. started-vakten hindrar titelskärmens färska tillstånd från
  // att skriva över en riktig sparfil.
  useEffect(() => {
    const onHide = () => {
      const g = useGameStore.getState();
      if (g.started) g.save();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastSaveAt = performance.now();

    const blocked = () => {
      const st = useGameStore.getState().state;
      return st.gameOver || !!st.gameWon || !!st.pendingDecision || !!st.auction || !!st.receivership;
    };

    const loop = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (blocked()) {
        useGameStore.getState().setRunning(false);
        return;
      }
      // Vid månadsspolning (⏭ Månad) rullar dagarna i fast förhöjd takt
      // oavsett vald hastighet – synligt, men snabbt.
      acc += dt * (until != null ? ROLL_SPEED : speed);
      let ticked = false;
      let monthRolled = false;
      let reachedTarget = false;
      // Dagssteget beror på aktuell månadslängd så varje månad tar MONTH_MS.
      let dayMs = MONTH_MS / daysInMonth(
        useGameStore.getState().state.year,
        useGameStore.getState().state.month,
      );
      while (acc >= dayMs && !blocked() && !reachedTarget) {
        acc -= dayMs;
        const prev = useGameStore.getState().state;
        const prevAbs = prev.year * 12 + prev.month;
        useGameStore.getState().dispatch({ type: "NEXT_DAY" });
        ticked = true;
        const st = useGameStore.getState().state;
        if (st.year * 12 + st.month !== prevAbs) monthRolled = true;
        if (until != null && st.year * 12 + st.month >= until) reachedTarget = true;
        dayMs = MONTH_MS / daysInMonth(st.year, st.month);
      }
      if (reachedTarget) {
        const store = useGameStore.getState();
        store.save();
        store.setRunning(false); // nollställer även until
        return;
      }
      if (ticked) {
        const store = useGameStore.getState();
        // Autospar vid varje månadsskifte så aldrig mer än en månads spel kan
        // tappas – men strypt på realtid så hög hastighet inte hackar av
        // ständig serialisering. Viktiga stopp sparas alltid direkt nedan.
        if (shouldAutosave(monthRolled, now, lastSaveAt)) {
          store.save();
          lastSaveAt = now;
        }
        if (blocked()) {
          store.save();
          store.setRunning(false);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, until]);
}
