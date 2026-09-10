import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedMesh, Object3D } from "three";
import { PARCELS, parcelById } from "../engine/city";
import type { ParcelContent } from "./ParcelNode";

/** Cheap baked-style contact occlusion. One draw, also available with shadows off. */
export function ContactFootprints({ parcels }: { parcels: Map<string, ParcelContent> }) {
  const ref = useRef<InstancedMesh>(null);
  const footprints = useMemo(() => [...parcels].flatMap(([id, content]) => {
    const p = parcelById(id);
    return p && "prop" in content && !content.prop.signature ? [p] : [];
  }), [parcels]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    footprints.forEach((p, i) => {
      const factor = p.district === "kulle" ? 0.68 : 1.07;
      o.position.set(p.x, 0.165, p.z);
      o.rotation.x = -Math.PI / 2;
      o.scale.set(p.w * factor, p.d * factor, 1);
      o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
    });
    mesh.count = footprints.length; mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [footprints]);
  return <instancedMesh ref={ref} args={[undefined, undefined, PARCELS.length]} raycast={() => null}>
    <planeGeometry />
    <shaderMaterial transparent depthWrite={false}
      vertexShader="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}"
      fragmentShader="varying vec2 vUv; void main(){vec2 d=max(abs(vUv-0.5)-0.30,0.0);float a=(1.0-smoothstep(0.0,0.20,length(d)))*0.24;gl_FragColor=vec4(0.12,0.14,0.16,a);}"
    />
  </instancedMesh>;
}
