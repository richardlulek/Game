/* ============================================================
   UI-tillstånd som inte hör till spelet: vald tomtruta på 3D-
   kartan och kamerafokus. Hålls utanför GameState så att
   sparfiler inte påverkas.
   ============================================================ */

import { create } from "zustand";

interface UiStore {
  selectedParcelId: string | null;
  select: (parcelId: string | null) => void;
  /** Kamerafokus – seq ökas per begäran så samma ruta kan fokuseras igen. */
  focusParcelId: string | null;
  focusSeq: number;
  requestFocus: (parcelId: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedParcelId: null,
  select: (selectedParcelId) => set({ selectedParcelId }),
  focusParcelId: null,
  focusSeq: 0,
  requestFocus: (parcelId) => set((s) => ({ focusParcelId: parcelId, focusSeq: s.focusSeq + 1 })),
}));
