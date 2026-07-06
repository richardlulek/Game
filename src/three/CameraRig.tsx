import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { parcelById } from "../engine/city";
import { useUiStore } from "../store/uiStore";

/** Minimal strukturell typ för MapControls – slipper three-stdlib-import. */
interface ControlsLike {
  target: { x: number; y: number; z: number };
  update: () => void;
}

/** Glider kamera + kontrollmål mot tomtrutan i senaste fokus-begäran. */
export function CameraRig() {
  const handledSeq = useRef(0);

  useFrame((rootState, delta) => {
    const { focusParcelId, focusSeq } = useUiStore.getState();
    if (focusSeq === handledSeq.current || !focusParcelId) return;
    const parcel = parcelById(focusParcelId);
    const controls = rootState.controls as unknown as ControlsLike | null;
    if (!parcel || !controls) {
      handledSeq.current = focusSeq;
      return;
    }
    const dx = parcel.x - controls.target.x;
    const dz = parcel.z - controls.target.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) {
      handledSeq.current = focusSeq;
      return;
    }
    // Flytta mål och kamera lika mycket så vinkeln bevaras.
    const f = Math.min(1, delta * 4);
    controls.target.x += dx * f;
    controls.target.z += dz * f;
    rootState.camera.position.x += dx * f;
    rootState.camera.position.z += dz * f;
    controls.update();
  });

  return null;
}
