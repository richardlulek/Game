import type { Parcel } from "../engine/city";
import { groundsPlan, type GroundRect } from "./groundsLayout";
import { clearStrip } from "./publicRealm";
export function propertyBoundaries(p: Parcel, plan: ReturnType<typeof groundsPlan>): GroundRect[] {
  if (p.district !== "kulle" && p.district !== "förort") return [];
  const blockers = [...plan.obstacles, ...plan.paving, ...plan.amenities, ...plan.beds].map(
    (r) => ({ ...r, w: r.w + 0.7, d: r.d + 0.7 }),
  );
  // Keep a central gate on each street-facing edge, even if routing found no entrance.
  for (const edge of ["n", "s", "e", "w"] as const)
    if (p.edges[edge])
      blockers.push({
        x: edge === "e" ? p.w / 2 : edge === "w" ? -p.w / 2 : 0,
        z: edge === "s" ? p.d / 2 : edge === "n" ? -p.d / 2 : 0,
        w: 2.2,
        d: 2.2,
      });
  return [
    { x: 0, z: -p.d / 2 + 0.45, w: p.w - 0.9, d: 0.5 },
    { x: 0, z: p.d / 2 - 0.45, w: p.w - 0.9, d: 0.5 },
    { x: -p.w / 2 + 0.45, z: 0, w: 0.5, d: p.d - 1.4 },
    { x: p.w / 2 - 0.45, z: 0, w: 0.5, d: p.d - 1.4 },
  ]
    .flatMap((r) => clearStrip(r, blockers))
    .filter((r) => Math.max(r.w, r.d) > 1.2);
}
