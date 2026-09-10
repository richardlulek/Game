import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type Mesh, type MeshBasicMaterial, type InstancedMesh } from "three";
import type { Property } from "../engine/types";
import { getReduceMotion } from "../store/prefs";
import { visualProgress, visualSnapshot, PROGRESS_COLORS, type VisualProgress } from "./visualProgress";

/** A short local receipt for a purchase, a new lease, or a completed repair.
 * Initial load is deliberately quiet; only subsequent state transitions pulse. */
export function PropertyFeedback({ property: p, owned, radius, detailed = false }: { property: Property; owned: boolean; radius: number; detailed?: boolean }) {
  const ref = useRef<Mesh>(null);
  const sparks = useRef<InstancedMesh>(null);
  const scratch = useRef<Object3D | null>(null);
  const [event, setEvent] = useState<VisualProgress | null>(null);
  const previous = useRef(visualSnapshot(p, owned));
  const remaining = useRef(0);
  useEffect(() => {
    const next = visualSnapshot(p, owned);
    const change = visualProgress(previous.current, next);
    if (change && !getReduceMotion()) { remaining.current = 2.2; setEvent(change); }
    previous.current = next;
  }, [owned, p]);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    remaining.current = getReduceMotion() ? 0 : Math.max(0, remaining.current - dt);
    mesh.visible = remaining.current > 0;
    if (!mesh.visible) { if (event) setEvent(null); return; }
    const progress = 1 - remaining.current / 2.2;
    const scale = 1 + (1 - (1 - progress) ** 2) * 0.22;
    mesh.scale.set(scale, scale, 1);
    (mesh.material as MeshBasicMaterial).opacity = (1 - progress) * 0.65;
    if (sparks.current) {
      const o = scratch.current ?? (scratch.current = new Object3D());
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        o.position.set(Math.cos(angle) * radius, 0.8 + progress * (3 + i % 3), Math.sin(angle) * radius);
        o.scale.setScalar(0.12 * Math.sin(progress * Math.PI));
        o.updateMatrix(); sparks.current.setMatrixAt(i, o.matrix);
      }
      sparks.current.instanceMatrix.needsUpdate = true;
      (sparks.current.material as MeshBasicMaterial).opacity = (1 - progress) * 0.7;
    }
  });
  return <><mesh ref={ref} visible={false} rotation-x={-Math.PI / 2} position={[0, 0.28, 0]} raycast={() => null}>
    <ringGeometry args={[radius, radius + 0.28, 48]} />
    <meshBasicMaterial color={event ? PROGRESS_COLORS[event] : "#d5b875"} transparent opacity={0} depthWrite={false} />
  </mesh>
    {detailed && event && <instancedMesh ref={sparks} args={[undefined, undefined, 8]} frustumCulled={false} raycast={() => null}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={PROGRESS_COLORS[event]} transparent opacity={0} depthWrite={false} />
    </instancedMesh>}
  </>;
}
