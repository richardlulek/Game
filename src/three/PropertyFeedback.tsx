import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import type { Property } from "../engine/types";
import { getReduceMotion } from "../store/prefs";

/** A short local receipt for a purchase, a new lease, or a completed repair.
 * Initial load is deliberately quiet; only subsequent state transitions pulse. */
export function PropertyFeedback({ property: p, owned, radius }: { property: Property; owned: boolean; radius: number }) {
  const ref = useRef<Mesh>(null);
  const previous = useRef({ owned, tenants: p.tenants.length, condition: p.condition });
  const remaining = useRef(0);
  useEffect(() => {
    const before = previous.current;
    const improved = p.tenants.length > before.tenants || p.condition >= before.condition + 8;
    if (owned && ((!before.owned && owned) || improved) && !getReduceMotion()) remaining.current = 1.6;
    previous.current = { owned, tenants: p.tenants.length, condition: p.condition };
  }, [owned, p.tenants.length, p.condition]);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    remaining.current = Math.max(0, remaining.current - dt);
    mesh.visible = remaining.current > 0;
    if (!mesh.visible) return;
    const progress = 1 - remaining.current / 1.6;
    const scale = 1 + progress * 0.28;
    mesh.scale.set(scale, scale, 1);
    (mesh.material as MeshBasicMaterial).opacity = (1 - progress) * 0.65;
  });
  return <mesh ref={ref} visible={false} rotation-x={-Math.PI / 2} position={[0, 0.28, 0]} raycast={() => null}>
    <ringGeometry args={[radius, radius + 0.28, 48]} />
    <meshBasicMaterial color="#d5b875" transparent opacity={0} depthWrite={false} />
  </mesh>;
}
