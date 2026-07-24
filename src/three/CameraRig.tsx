import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { parcelById } from "../engine/city";
import { useUiStore } from "../store/uiStore";

/** Minimal strukturell typ för MapControls – slipper three-stdlib-import. */
interface ControlsLike {
  target: { x: number; y: number; z: number };
  update: () => void;
}

/** Avstånds-LOD: EN useFrame läser kamerans avstånd till mål och slår om
 *  uiStore.lodFar när vyn går in i/ur översikt. Hysteres (220 in, 180 ut) så
 *  läget inte flimrar vid tröskeln, och store-set:et sker BARA vid växling –
 *  inte varje bildruta. Hus tappar då småmeshar och statusmärken döljs, vilket
 *  skär draw calls just när hela staden är i bild (värsta fallet). */
const LOD_ENTER = 220;
const LOD_EXIT = 180;
const _t = new Vector3();

export function LodController() {
  const far = useRef(false);
  useFrame((rootState) => {
    const controls = rootState.controls as unknown as ControlsLike | null;
    if (!controls) return;
    _t.set(controls.target.x, controls.target.y, controls.target.z);
    const d = rootState.camera.position.distanceTo(_t);
    const next = far.current ? d > LOD_EXIT : d > LOD_ENTER;
    if (next !== far.current) {
      far.current = next;
      useUiStore.getState().setLodFar(next);
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
