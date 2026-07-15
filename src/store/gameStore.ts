/* ============================================================
   Zustand-store. Wrappar den rena reducern och engine-funktionerna
   (ersätter prototypens useReducer) samt persistensen.
   ============================================================ */

import { create } from "zustand";
import { initState, reducer } from "../engine";
import { placeCity } from "../engine/city";
import { readRng, seedRng } from "../engine/random";
import { advanceStory } from "../engine/story";
import type { GameAction, GameState } from "../engine/types";
import { getActiveSlot, hasSave, loadGame, saveGame, setActiveSlot } from "./persistence";

export type ClockSpeed = 1 | 2 | 4 | 8;

interface GameStore {
  state: GameState;
  activeSlot: number;
  /** Spelklockan: rullande månader (se hooks/useGameClock). `until` är ett
   *  månadsindex (år*12+månad) – klockan spolar dit i förhöjd takt och
   *  stannar sedan (⏭ Månad-knappen, som rullar dagarna i stället för att
   *  hoppa direkt). */
  clock: { running: boolean; speed: ClockSpeed; until: number | null };
  setRunning: (running: boolean) => void;
  setSpeed: (speed: ClockSpeed) => void;
  /** Rulla dagarna i snabb takt fram till nästa månadsskifte. */
  rollToNextMonth: () => void;
  /** Skickar en action genom den rena reducern. */
  dispatch: (action: GameAction) => void;
  /** Sparar nuvarande tillstånd till localStorage. */
  save: () => boolean;
  /** Laddar sparat tillstånd om det finns. Returnerar true vid träff. */
  load: (slot?: number) => boolean;
  /** Finns en sparfil i given slot? */
  hasSave: (slot?: number) => boolean;
  /** Byt aktiv sparslot. */
  setSlot: (slot: number) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: placeCity(initState()),
  activeSlot: getActiveSlot(),
  clock: { running: false, speed: 1, until: null },
  // Manuell paus/play nollställer alltid ett pågående månadsspolande.
  setRunning: (running) => set((s) => ({ clock: { ...s.clock, running, until: null } })),
  setSpeed: (speed) => set((s) => ({ clock: { ...s.clock, speed } })),
  rollToNextMonth: () =>
    set((s) => ({
      clock: {
        ...s.clock,
        running: true,
        until: s.state.year * 12 + s.state.month + 1,
      },
    })),
  // advanceStory efter varje action gör att kampanjmål bockas av direkt
  // (inte först vid nästa månadstick) – brev kan dyka upp mitt i en handling.
  // Månadsticken kör advanceStory internt också (för spolning); det är ofarligt
  // eftersom advanceStory är idempotent – andra körningen no-oppar.
  //
  // Slumpen seedas HÄR: PRNG:n sätts från tillståndets rng före reducern och
  // det framflyttade tillståndet läses tillbaka efteråt, så samma frö + samma
  // händelsesekvens ger identiskt utfall (determinism/replay).
  dispatch: (action) =>
    set((s) => {
      seedRng(s.state.rng ?? s.state.seed ?? (Date.now() >>> 0));
      const next = placeCity(advanceStory(reducer(s.state, action)));
      return { state: { ...next, rng: readRng() } };
    }),
  save: () => saveGame(get().state, get().activeSlot),
  load: (slot?: number) => {
    const s = slot ?? get().activeSlot;
    const loaded = loadGame(s);
    if (loaded) {
      setActiveSlot(s);
      set({ state: placeCity(loaded), activeSlot: s });
      return true;
    }
    return false;
  },
  hasSave: (slot?: number) => hasSave(slot ?? get().activeSlot),
  setSlot: (slot: number) => {
    setActiveSlot(slot);
    set({ activeSlot: slot });
  },
}));
