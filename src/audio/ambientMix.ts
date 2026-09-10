export type AmbientLayer = "wind" | "traffic" | "crowd" | "water" | "industry" | "works";
export type AmbientMix = Record<AmbientLayer, number>;
export const QUIET_CITY: AmbientMix = { wind: 0, traffic: 0, crowd: 0, water: 0, industry: 0, works: 0 };
interface Zone { district: string; x: number; z: number; w: number; d: number; }

const PROFILES: Record<string, AmbientMix> = {
  centrum: { wind: 0.12, traffic: 0.55, crowd: 0.65, water: 0, industry: 0, works: 0 },
  innerstad: { wind: 0.15, traffic: 0.4, crowd: 0.5, water: 0, industry: 0, works: 0 },
  finans: { wind: 0.3, traffic: 0.55, crowd: 0.4, water: 0, industry: 0, works: 0 },
  hamnen: { wind: 0.45, traffic: 0.18, crowd: 0.15, water: 0.85, industry: 0.25, works: 0 },
  industri: { wind: 0.2, traffic: 0.35, crowd: 0.05, water: 0, industry: 0.75, works: 0 },
  förort: { wind: 0.4, traffic: 0.2, crowd: 0.3, water: 0, industry: 0, works: 0 },
  kulle: { wind: 0.65, traffic: 0.08, crowd: 0.1, water: 0, industry: 0, works: 0 },
};

/** Continuous spatial blend across district edges. The city recedes as the
 * camera rises; occupancy and actual physical works control the local activity. */
export function ambientMixAt(zones: readonly Zone[], x: number, z: number, cameraDistance: number, occupancy: number, working: boolean): AmbientMix {
  const near = Math.max(0, Math.min(1, (500 - cameraDistance) / 400));
  const mix = { ...QUIET_CITY };
  let total = 0;
  for (const zone of zones) {
    const distance = Math.hypot(Math.max(0, Math.abs(x - zone.x) - zone.w / 2), Math.max(0, Math.abs(z - zone.z) - zone.d / 2));
    const weight = Math.exp(-Math.pow(distance / 65, 2));
    const profile = PROFILES[zone.district];
    if (!profile) continue;
    total += weight;
    for (const key of Object.keys(mix) as AmbientLayer[]) mix[key] += profile[key] * weight;
  }
  for (const key of Object.keys(mix) as AmbientLayer[]) mix[key] = Math.min(1, mix[key] / Math.max(1, total)) * near;
  mix.crowd *= Math.max(0, Math.min(1, occupancy));
  mix.works = working ? near * 0.75 : 0;
  return mix;
}
