import { Color } from "three";
/** One material language for baked background facades and physical details. */
export const ARCHITECTURE = {
  glass: "#606a68",
  vacantGlass: "#454e4d",
  metal: "#575e59",
  roof: "#56574f",
};
export function architecturePalette(wall: string) {
  const color = new Color(wall);
  return {
    frame: color.clone().lerp(new Color("#d4cec0"), 0.18).getStyle(),
    base: color.clone().multiplyScalar(0.78).getStyle(),
    glass: ARCHITECTURE.glass,
  };
}
