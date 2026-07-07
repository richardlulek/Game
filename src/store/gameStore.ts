/* ============================================================
   Zustand-store. Wrappar den rena reducern och engine-funktionerna
   (ersätter prototypens useReducer) samt persistensen.
   ============================================================ */

import { create } from "zustand";
import { initState, reducer } from "../engine";
import { placeCity } from "../engine/city";
import type { GameAction, GameState } from "../engine/types";
import { getActiveSlot, hasSave, loadGame, saveGame, setActiveSlot } from "./persistence";

export type ClockSpeed = 1 | 2 | 4;

interface GameStore {
  state: GameState;
  activeSlot: number;
  /** Spelklockan: rullande månader (se hooks/useGameClock). */
  clock: { running: boolean; speed: ClockSpeed };
  setRunning: (running: boolean) => void;
  setSpeed: (speed: ClockSpeed) => void;
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
  clock: { running: false, speed: 1 },
  setRunning: (running) => set((s) => ({ clock: { ...s.clock, running } })),
  setSpeed: (speed) => set((s) => ({ clock: { ...s.clock, speed } })),
  dispatch: (action) => set((s) => ({ state: placeCity(reducer(s.state, action)) })),
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
