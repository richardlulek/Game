/* ============================================================
   Zustand-store. Wrappar den rena reducern och engine-funktionerna
   (ersätter prototypens useReducer) samt persistensen.
   ============================================================ */

import { create } from "zustand";
import { initState, reducer } from "../engine";
import type { GameAction, GameState } from "../engine/types";
import { hasSave, loadGame, saveGame } from "./persistence";

interface GameStore {
  state: GameState;
  /** Skickar en action genom den rena reducern. */
  dispatch: (action: GameAction) => void;
  /** Sparar nuvarande tillstånd till localStorage. */
  save: () => boolean;
  /** Laddar sparat tillstånd om det finns. Returnerar true vid träff. */
  load: () => boolean;
  /** Finns en sparfil? */
  hasSave: () => boolean;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: initState(),
  dispatch: (action) => set((s) => ({ state: reducer(s.state, action) })),
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
