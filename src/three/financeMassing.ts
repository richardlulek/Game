import type { Parcel } from "../engine/city";
import type { StructureVolume } from "./facadeStructure";
export function financeMassing(parcel: Parcel, h: number, seed: number): StructureVolume[] {
  const w = parcel.w * 0.72,
    d = parcel.d * 0.72;
  const volumes: StructureVolume[] = [
    ...(seed % 2 === 0
      ? [{ w: parcel.w * 0.92, d: parcel.d * 0.92, h: 3 * (2 + ((seed >> 2) % 2)) }]
      : []),
    ...(seed % 3 === 1
      ? [
          { w, d, h: h * 0.6 },
          { w: w * 0.78, d: d * 0.78, h: h * 0.25, y: h * 0.6 },
          { w: w * 0.55, d: d * 0.55, h: h * 0.15, y: h * 0.85 },
        ]
      : seed % 3 === 2
        ? [
            { w, d, h: h * 0.85 },
            { w: w * 0.6, d: d * 0.6, h: h * 0.15, y: h * 0.85, rotation: Math.PI / 4 },
          ]
        : [{ w, d, h }]),
  ];
  const podiumH = seed % 2 === 0 ? volumes[0].h : 0;
  return volumes.flatMap((v, i) => {
    if (i === 0 && podiumH) return [v];
    const bottom = Math.max(v.y ?? 0, podiumH),
      top = (v.y ?? 0) + v.h;
    return top > bottom ? [{ ...v, y: bottom, h: top - bottom }] : [];
  });
}
