/* Delade hjälpare för statisk 3D-dekor: instansiering, vertexfärg
   och livscykelstädning. Används av StaticCity och Backdrop. */

import { useEffect } from "react";
import {
  type BufferGeometry,
  type Color,
  Float32BufferAttribute,
  InstancedMesh,
  type MeshStandardMaterial,
  Object3D,
} from "three";

export interface Inst {
  x: number; y: number; z: number;
  sx?: number; sy?: number; sz?: number;
  rotY?: number;
  rotZ?: number;
  color?: Color;
}

/** Bygger en InstancedMesh ur en geometri + lista av transformer. */
export function buildInstances(
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  items: Inst[],
  shadows: { cast?: boolean; receive?: boolean } = {},
): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, items.length);
  const o = new Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.rotY ?? 0, it.rotZ ?? 0);
    o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows.cast ?? false;
  mesh.receiveShadow = shadows.receive ?? false;
  return mesh;
}

/** Monterar och städar en engångsbyggd mesh/geometri. */
export function useDisposable<T extends { dispose?: () => void } | InstancedMesh>(obj: T | null) {
  useEffect(() => {
    return () => {
      if (obj instanceof InstancedMesh) {
        obj.geometry.dispose();
        obj.dispose();
      } else if (obj && "dispose" in obj && obj.dispose) obj.dispose();
    };
  }, [obj]);
}

/** Fyller geometrin med en enhetlig vertexfärg. */
export function withColor(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new Float32BufferAttribute(arr, 3));
  return g;
}
