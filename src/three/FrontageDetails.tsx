import { architecturePalette } from "./architecturePalette";
import { createContext, useContext, useEffect, useMemo } from "react";
import { BoxGeometry, MeshStandardMaterial } from "three";
import type { Property } from "../engine/types";
import { useUiStore } from "../store/uiStore";
import { buildInstances } from "./meshHelpers";
import { DISTRICT_FRONTAGES, frontageParts, frontageState, type FrontageSurface } from "./frontageDesign";
import { nameSignTexture } from "./textures";

// Only the viewed interactive block provides a property. Ambient houses keep
// their inexpensive existing entrances and do not allocate detailed meshes.
export const FrontageContext = createContext<{ property: Property; district: string; color?: string } | null>(null);

export function FrontageDetails({ w, d, sx, sz }: { w: number; d: number; sx: number; sz: number }) {
  const data = useContext(FrontageContext);
  const low = useUiStore(s => s.graphics === "low");
  const evening = useUiStore(s => s.lightMode === "evening");
  const width = sx ? d : w;
  const meshes = useMemo(() => {
    if (!data) return [];
    const parts = frontageParts(width, data.district, data.property, low);
    const style = DISTRICT_FRONTAGES[data.district] ?? DISTRICT_FRONTAGES.kulle;
    const parent = architecturePalette(data.color ?? style.stone);
    const colors = { ...style, stone: parent.frame, frame: parent.base, dark: "#202a2d", glass: parent.glass, warm: "#f1ce8d", green: "#536e4f" };
    return (Object.keys(parts) as FrontageSurface[]).filter(key => parts[key].length > 0).map(key => {
      const mat = new MeshStandardMaterial({ color: colors[key],
        roughness: key === "glass" ? 0.23 : key === "frame" ? 0.4 : 0.88,
        metalness: key === "glass" ? 0.5 : key === "frame" ? style.metalness : 0,
        emissive: key === "warm" ? "#f4c17e" : "#000000",
        emissiveIntensity: key === "warm" ? evening ? 1.1 : 0.3 : 0,
      });
      return buildInstances(new BoxGeometry(), mat, parts[key], { receive: true });
    });
  }, [data, width, low, evening]);
  useEffect(() => () => meshes.forEach(m => { m.geometry.dispose(); (m.material as MeshStandardMaterial).dispose(); m.dispose(); }), [meshes]);
  if (!data || width < 2) return null;
  const state = frontageState(data.property);
  const label = state.label;
  const top = data.property.type === "industri" ? 4.5 : 3.15;
  const rotation = sx ? sx * Math.PI / 2 : sz < 0 ? Math.PI : 0;
  return <group position={[sx * w / 2, 0, sz * d / 2]} rotation-y={rotation}>
    {meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}
    {!low && <mesh position={[Math.min(width * 0.35, 3.2), 2.75, 0.7]} raycast={() => null}>
      <planeGeometry args={[0.8, 0.45]} />
      <meshStandardMaterial map={nameSignTexture(String(data.property.id))} roughness={0.8} />
    </mesh>}
    {label && <mesh position={[0, top + 0.05, 0.93]} raycast={() => null}>
      <planeGeometry args={[Math.min(width * 0.8, 6.5), 0.55]} />
      <meshStandardMaterial map={nameSignTexture(label.slice(0, 26))} roughness={0.75} />
    </mesh>}
  </group>;
}
