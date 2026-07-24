/* ============================================================
   UI-tillstånd som inte hör till spelet: vald tomtruta på 3D-
   kartan och kamerafokus. Hålls utanför GameState så att
   sparfiler inte påverkas.
   ============================================================ */

import { create } from "zustand";
import { getGraphics, getShowFps, setGraphics, setShowFps, type Quality } from "./prefs";

/** Kartlager à la Capitalism Lab: färga egna hus efter en nyckelmetrik. */
export type OverlayMode = "ingen" | "vakans" | "skick" | "avkastning";

/** Pågående berättelsepaus: kameran visar scenen innan nästa brev öppnas. */
export interface Cinematic {
  /** pendingDecision-id vars modal hålls dold under pausen. */
  id: string;
  start: number;
  until: number;
  /** Rogges bil ska glida in under pausen. */
  car?: boolean;
  /** Kort text i pauschippen ("En vit bil glider in …"). */
  hint?: string;
}

interface UiStore {
  overlay: OverlayMode;
  setOverlay: (overlay: OverlayMode) => void;
  selectedParcelId: string | null;
  select: (parcelId: string | null) => void;
  /** Kamerafokus – seq ökas per begäran så samma ruta kan fokuseras igen.
   *  zoom anger önskat kameraavstånd (närbild); utelämnad = behåll höjd. */
  focusParcelId: string | null;
  /** Alternativ till parcell: en fri punkt på kartan (distriktssvep, HK …). */
  focusPoint: { x: number; z: number } | null;
  focusZoom: number | null;
  focusSeq: number;
  requestFocus: (parcelId: string, zoom?: number) => void;
  requestFocusPoint: (x: number, z: number, zoom?: number) => void;
  cinematic: Cinematic | null;
  setCinematic: (c: Cinematic | null) => void;
  /** Öppna-begäran från 3D-vyn (t.ex. klick på statusikon): "offers"
   *  öppnar budinkorgen, annars ett fönster-id. Hanteras och nollas
   *  av FastighetsImperium. */
  pendingOpen: string | null;
  requestOpen: (target: string) => void;
  clearOpen: () => void;
  /** Öppen minneslapp (berättelseläget) – kortet renderas i DOM-lagret. */
  openNoteId: string | null;
  setOpenNote: (id: string | null) => void;
  /** FPS-mätaren synlig? Persisteras i localStorage via prefs. */
  showFps: boolean;
  setShowFps: (on: boolean) => void;
  /** Avstånds-LOD: true när kameran är i översikt (utzoomad). Sätts av
   *  LodController i Canvas; hus tappar småmeshar och statusmärken döljs. */
  lodFar: boolean;
  setLodFar: (far: boolean) => void;
  /** Grafikkvalitet (low/medium/high). Persisteras via prefs. */
  graphics: Quality;
  setGraphics: (q: Quality) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  overlay: "ingen",
  setOverlay: (overlay) => set({ overlay }),
  selectedParcelId: null,
  select: (selectedParcelId) => set({ selectedParcelId }),
  focusParcelId: null,
  focusPoint: null,
  focusZoom: null,
  focusSeq: 0,
  requestFocus: (parcelId, zoom) =>
    set((s) => ({ focusParcelId: parcelId, focusPoint: null, focusZoom: zoom ?? null, focusSeq: s.focusSeq + 1 })),
  requestFocusPoint: (x, z, zoom) =>
    set((s) => ({ focusParcelId: null, focusPoint: { x, z }, focusZoom: zoom ?? null, focusSeq: s.focusSeq + 1 })),
  cinematic: null,
  setCinematic: (cinematic) => set({ cinematic }),
  pendingOpen: null,
  requestOpen: (pendingOpen) => set({ pendingOpen }),
  clearOpen: () => set({ pendingOpen: null }),
  openNoteId: null,
  setOpenNote: (openNoteId) => set({ openNoteId }),
  showFps: getShowFps(),
  setShowFps: (on) => { setShowFps(on); set({ showFps: on }); },
  lodFar: false,
  setLodFar: (lodFar) => set({ lodFar }),
  graphics: getGraphics(),
  setGraphics: (graphics) => { setGraphics(graphics); set({ graphics }); },
}));
