/* ============================================================
   Zustand-store. Wrappar den rena reducern och engine-funktionerna
   (ersätter prototypens useReducer) samt persistensen.
   ============================================================ */

import { create } from "zustand";
import { initState, reducer } from "../engine";
import type { GameAction, GameState } from "../engine/types";
import { getActiveSlot, hasSave, loadGame, saveGame, setActiveSlot } from "./persistence";

interface GameStore {
  state: GameState;
  activeSlot: number;
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
  state: initState(),
  activeSlot: getActiveSlot(),
  dispatch: (action) => set((s) => ({ state: reducer(s.state, action) })),
  save: () => saveGame(get().state, get().activeSlot),
  load: (slot?: number) => {
    const s = slot ?? get().activeSlot;
    const loaded = loadGame(s);
    if (loaded) {
      setActiveSlot(s);
      set({ state: loaded, activeSlot: s });
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
