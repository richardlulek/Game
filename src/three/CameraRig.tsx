import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { PARCELS, parcelById } from "../engine/city";
import { useUiStore } from "../store/uiStore";
import { GRAPHICS_PRESETS } from "../store/prefs";

/** Minimal strukturell typ för MapControls – slipper three-stdlib-import. */
interface ControlsLike {
  target: { x: number; y: number; z: number };
  update: () => void;
}

/** Avstånds-LOD: EN useFrame läser kamerans avstånd till mål och slår om
 *  uiStore.lodFar när vyn går in i/ur översikt. Hysteres (enter/exit ur
 *  grafikpresetet) så läget inte flimrar vid tröskeln, och store-set:et sker
 *  BARA vid växling – inte varje bildruta. Små byggnadsdetaljer och
 *  statusmärken döljs, medan fasader och tak behåller sin form. */
const _t = new Vector3();

export function LodController() {
  const far = useRef(false);
  const elapsed = useRef(0);
  const preset = useUiStore((s) => GRAPHICS_PRESETS[s.graphics]);
  useFrame((rootState, dt) => {
    const controls = rootState.controls as unknown as ControlsLike | null;
    if (!controls) return;
    _t.set(controls.target.x, controls.target.y, controls.target.z);
    const d = rootState.camera.position.distanceTo(_t);
    const next = far.current ? d > preset.lodExit : d > preset.lodEnter;
    if (next !== far.current) {
      far.current = next;
      useUiStore.getState().setLodFar(next);
    }
    elapsed.current += dt;
    if (elapsed.current > 0.3) {
      elapsed.current = 0;
      const ui = useUiStore.getState();
      const selected = ui.selectedParcelId ? parcelById(ui.selectedParcelId) : null;
      const nearbySelected = selected && Math.hypot(selected.x - _t.x, selected.z - _t.z) < 80 ? selected : null;
      const nearest = nearbySelected ?? PARCELS.reduce<typeof PARCELS[number] | null>((best, p) =>
        !best || Math.hypot(p.x - _t.x, p.z - _t.z) < Math.hypot(best.x - _t.x, best.z - _t.z) ? p : best, null);
      const block = !next && d < 340 ? nearest?.blockId ?? null : null;
      if (block !== ui.detailBlockId) ui.setDetailBlock(block);
    }
  });
  return null;
}

/** Glider kamera + kontrollmål mot tomtrutan i senaste fokus-begäran.
 *  Med focusZoom satt dollyas kameran dessutom in till det avståndet,
 *  så berättelsescener landar i närbild i stället för på översiktshöjd. */
export function CameraRig() {
  const handledSeq = useRef(0);

  useFrame((rootState, delta) => {
    const { focusParcelId, focusPoint, focusZoom, focusSeq } = useUiStore.getState();
    if (focusSeq === handledSeq.current || (!focusParcelId && !focusPoint)) return;
    const parcel = focusParcelId ? parcelById(focusParcelId) : null;
    const goal = focusPoint ?? (parcel ? { x: parcel.x, z: parcel.z } : null);
    const controls = rootState.controls as unknown as ControlsLike | null;
    if (!goal || !controls) {
      handledSeq.current = focusSeq;
      return;
    }
    const dx = goal.x - controls.target.x;
    const dz = goal.z - controls.target.z;
    const dist = Math.hypot(dx, dz);
    const f = Math.min(1, delta * 4);

    // Dolly: krymp kamerans avstånd till målet mot focusZoom.
    let zoomLeft = 0;
    if (focusZoom !== null) {
      const cam = rootState.camera.position;
      const ox = cam.x - controls.target.x;
      const oy = cam.y - controls.target.y;
      const oz = cam.z - controls.target.z;
      const len = Math.hypot(ox, oy, oz);
      zoomLeft = Math.abs(len - focusZoom);
      if (zoomLeft > 1 && len > 0.001) {
        const nl = len + (focusZoom - len) * f;
        cam.set(
          controls.target.x + (ox / len) * nl,
          controls.target.y + (oy / len) * nl,
          controls.target.z + (oz / len) * nl,
        );
      }
    }

    if (dist < 1 && zoomLeft <= 1) {
      handledSeq.current = focusSeq;
      controls.update();
      return;
    }
    // Flytta mål och kamera lika mycket så vinkeln bevaras.
    controls.target.x += dx * f;
    controls.target.z += dz * f;
    rootState.camera.position.x += dx * f;
    rootState.camera.position.z += dz * f;
    controls.update();
  });

  return null;
}
