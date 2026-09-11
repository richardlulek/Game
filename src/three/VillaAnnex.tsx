import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, MeshStandardMaterial } from "three";
import { buildInstances } from "./meshHelpers";
import { villaAnnex } from "./villaAnnex";
export function VillaAnnex({ w, d, color }: { w: number; d: number; color: string }) {
  const mesh = useMemo(
    () =>
      buildInstances(
        new BoxGeometry(),
        new MeshStandardMaterial({ color: "white", roughness: 0.85 }),
        villaAnnex(w, d, color).map((p) => ({ ...p, color: new Color(p.color) })),
        { cast: true, receive: true },
      ),
    [w, d, color],
  );
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}
