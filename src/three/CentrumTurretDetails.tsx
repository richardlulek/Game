import { useEffect, useMemo } from "react";
import { BoxGeometry, Color, CylinderGeometry, MeshStandardMaterial } from "three";
import { buildInstances } from "./meshHelpers";
import { turretDetails } from "./centrumDetails";

/** Shared material batches keep ornament visible in cards and low detail. */
export function CentrumTurretDetails({ floors, color, enabled }: { floors: number; color: string; enabled: boolean }) {
  const meshes = useMemo(() => {
    if (!enabled) return [];
    const { frames, panes, bands } = turretDetails(floors);
    const trim = new Color(color).lerp(new Color("#e6ddc9"), 0.4);
    return [
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: trim, roughness: 0.85 }), frames, { receive: true }),
      buildInstances(new BoxGeometry(), new MeshStandardMaterial({ color: "#53636b", roughness: 0.3, metalness: 0.18 }), panes),
      buildInstances(new CylinderGeometry(1, 1, 1, 10), new MeshStandardMaterial({ color: trim, roughness: 0.85 }), bands, { receive: true }),
    ];
  }, [floors, color, enabled]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  return <group>{meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}</group>;
}
