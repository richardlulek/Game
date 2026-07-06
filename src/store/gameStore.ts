/* ============================================================
   Zustand-store. Wrappar den rena reducern och engine-funktionerna
   (ersätter prototypens useReducer) samt persistensen.
   Innehåller även spelklockan (paus/hastighet) – själva tickandet
   drivs av hooks/useGameClock.ts.
   ============================================================ */

import { create } from "zustand";
import { initState, reducer } from "../engine";
import type { GameAction, GameState } from "../engine/types";
import { hasSave, loadGame, saveGame } from "./persistence";

export type ClockSpeed = 1 | 2 | 4;

export interface ClockState {
  running: boolean;
  speed: ClockSpeed;
}

interface GameStore {
  state: GameState;
  clock: ClockState;
  /** Skickar en action genom den rena reducern. */
  dispatch: (action: GameAction) => void;
  /** Startar/pausar spelklockan. */
  setRunning: (running: boolean) => void;
  /** Sätter klockans hastighet. */
  setSpeed: (speed: ClockSpeed) => void;
  /** Sparar nuvarande tillstånd till localStorage. */
  save: () => boolean;
  /** Laddar sparat tillstånd om det finns. Returnerar true vid träff. */
  load: () => boolean;
  /** Finns en sparfil? */
  hasSave: () => boolean;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: initState(),
  clock: { running: false, speed: 1 },
  dispatch: (action) => set((s) => ({ state: reducer(s.state, action) })),
  setRunning: (running) => set((s) => ({ clock: { ...s.clock, running } })),
  setSpeed: (speed) => set((s) => ({ clock: { ...s.clock, speed } })),
  save: () => saveGame(get().state),
  load: () => {
    const loaded = loadGame();
    if (loaded) {
      set({ state: loaded });
      return true;
    }
    return false;
  },
  hasSave: () => hasSave(),
}));
