/* Ren placeringslogik för infrastrukturens 3D-symboler – egen modul så
   InfraWorks.tsx bara exporterar komponenter (fast refresh). */

import { PARCELS } from "../engine/city";
import type { GameState } from "../engine/types";

export interface InfraSpot {
  kind: string;
  district: string;
  x: number;
  z: number;
  /** Pågående bygge: 0–1; invigt: 1. */
  progress: number;
}

/** Distriktets södra kantmitt ur tomtrutorna (memo per distrikt). */
let edgeSource: typeof PARCELS[0] | undefined;
let edgeCache = new Map<string, { minX: number; maxX: number; maxZ: number }>();
function districtEdges() {
  if(edgeSource === PARCELS[0]) return edgeCache;
  edgeSource = PARCELS[0];
  const acc = new Map<string, { minX: number; maxX: number; maxZ: number }>();
  for (const p of PARCELS) {
    const cur = acc.get(p.district) ?? { minX: Infinity, maxX: -Infinity, maxZ: -Infinity };
    cur.minX = Math.min(cur.minX, p.x - p.w / 2);
    cur.maxX = Math.max(cur.maxX, p.x + p.w / 2);
    cur.maxZ = Math.max(cur.maxZ, p.z + p.d / 2);
    acc.set(p.district, cur);
  }
  edgeCache = acc;
  return acc;
}

/** Ren placeringslogik: var infrastrukturens symboler står. */
export function infraSpotsFor(state: GameState): InfraSpot[] {
  const spots: InfraSpot[] = [];
  const perDistrict = new Map<string, number>();
  const place = (district: string): { x: number; z: number } | null => {
    const edge = districtEdges().get(district);
    if (!edge) return null;
    const i = perDistrict.get(district) ?? 0;
    perDistrict.set(district, i + 1);
    const mid = (edge.minX + edge.maxX) / 2;
    // Sprid i sidled: 0, +7, −7, +14 … utan att lämna distriktets bredd.
    const off = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 7;
    const x = Math.max(edge.minX + 2, Math.min(edge.maxX - 2, mid + off));
    return { x, z: edge.maxZ + 3.2 };
  };
  for (const b of state.infraBuilt ?? []) {
    const pos = place(b.district);
    if (pos) spots.push({ kind: b.kind, district: b.district, ...pos, progress: 1 });
  }
  for (const pr of state.infraProjects ?? []) {
    const pos = place(pr.district);
    if (pos)
      spots.push({
        kind: pr.kindId ?? "okänd",
        district: pr.district,
        ...pos,
        progress: Math.max(0.05, 1 - pr.monthsLeft / Math.max(1, pr.totalMonths)),
      });
  }
  return spots;
}

