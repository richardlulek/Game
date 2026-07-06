/* ============================================================
   UI-tillstånd som inte hör till spelet: vald tomtruta, kamera-
   fokus och tillfälliga händelsemarkörer på kartan. Hålls utanför
   GameState så att sparfiler inte påverkas.
   ============================================================ */

import { create } from "zustand";
import type { LogKind } from "../engine/types";

/** En tillfällig händelsemarkör på kartan. */
export interface MapMarker {
  id: number;
  parcelId: string;
  kind: LogKind;
}

interface UiStore {
  selectedParcelId: string | null;
  select: (parcelId: string | null) => void;
  /** Kamerafokus – seq ökas per begäran så samma ruta kan fokuseras igen. */
  focusParcelId: string | null;
  focusSeq: number;
  requestFocus: (parcelId: string) => void;
  markers: MapMarker[];
  addMarker: (parcelId: string, kind: LogKind) => void;
}

let nextMarkerId = 1;
/** Hur länge en händelsemarkör syns på kartan. */
const MARKER_TTL_MS = 7000;

export const useUiStore = create<UiStore>((set) => ({
  selectedParcelId: null,
  select: (selectedParcelId) => set({ selectedParcelId }),
  focusParcelId: null,
  focusSeq: 0,
  requestFocus: (parcelId) => set((s) => ({ focusParcelId: parcelId, focusSeq: s.focusSeq + 1 })),
  markers: [],
  addMarker: (parcelId, kind) => {
    const id = nextMarkerId++;
    set((s) => ({ markers: [...s.markers, { id, parcelId, kind }] }));
    setTimeout(
      () => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),
      MARKER_TTL_MS,
    );
  },
}));
