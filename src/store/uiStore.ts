/* ============================================================
   UI-tillstånd som inte hör till spelet: vald tomtruta på kartan
   och vilken flik sidopanelen visar. Hålls utanför GameState så
   att sparfiler inte påverkas.
   ============================================================ */

import { create } from "zustand";

interface UiStore {
  selectedParcelId: string | null;
  select: (parcelId: string | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedParcelId: null,
  select: (selectedParcelId) => set({ selectedParcelId }),
}));
