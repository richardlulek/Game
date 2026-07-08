/* ============================================================
   UI-tillstånd som inte hör till spelet: vald tomtruta på 3D-
   kartan och kamerafokus. Hålls utanför GameState så att
   sparfiler inte påverkas.
   ============================================================ */

import { create } from "zustand";

/** Kartlager à la Capitalism Lab: färga egna hus efter en nyckelmetrik. */
export type OverlayMode = "ingen" | "vakans" | "skick" | "avkastning";

interface UiStore {
  overlay: OverlayMode;
  setOverlay: (overlay: OverlayMode) => void;
  selectedParcelId: string | null;
  select: (parcelId: string | null) => void;
  /** Kamerafokus – seq ökas per begäran så samma ruta kan fokuseras igen. */
  focusParcelId: string | null;
  focusSeq: number;
  requestFocus: (parcelId: string) => void;
  /** Öppna-begäran från 3D-vyn (t.ex. klick på statusikon): "offers"
   *  öppnar budinkorgen, annars ett fönster-id. Hanteras och nollas
   *  av FastighetsImperium. */
  pendingOpen: string | null;
  requestOpen: (target: string) => void;
  clearOpen: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  overlay: "ingen",
  setOverlay: (overlay) => set({ overlay }),
  selectedParcelId: null,
  select: (selectedParcelId) => set({ selectedParcelId }),
  focusParcelId: null,
  focusSeq: 0,
  requestFocus: (parcelId) => set((s) => ({ focusParcelId: parcelId, focusSeq: s.focusSeq + 1 })),
  pendingOpen: null,
  requestOpen: (pendingOpen) => set({ pendingOpen }),
  clearOpen: () => set({ pendingOpen: null }),
}));
