import type { Property } from "../engine/types";
import { buildingWorkState } from "./buildingWorkState";

export interface DistrictFrontage {
  stone: string; frame: string; accent: string; wood: string;
  metalness: number; canopy: "cornice" | "slim" | "timber" | "industrial";
}
/** Fixed architectural identity; leases and ownership never recolor a district. */
export const DISTRICT_FRONTAGES: Record<string, DistrictFrontage> = {
  centrum: { stone: "#d6c7ac", frame: "#705b39", accent: "#713e43", wood: "#826246", metalness: 0.5, canopy: "cornice" },
  innerstad: { stone: "#c1bcb0", frame: "#424e4a", accent: "#42665c", wood: "#a58059", metalness: 0.25, canopy: "slim" },
  finans: { stone: "#9ba6ac", frame: "#c3cbd0", accent: "#354a5d", wood: "#8e7760", metalness: 0.75, canopy: "slim" },
  hamnen: { stone: "#9c9687", frame: "#3a4245", accent: "#854b3e", wood: "#957351", metalness: 0.6, canopy: "timber" },
  industri: { stone: "#a0a29b", frame: "#68777f", accent: "#cfaa48", wood: "#9e855d", metalness: 0.7, canopy: "industrial" },
  förort: { stone: "#c4c8b9", frame: "#e1ddd0", accent: "#4f7774", wood: "#b19063", metalness: 0.15, canopy: "slim" },
  kulle: { stone: "#b7b0a0", frame: "#e9e0ce", accent: "#486151", wood: "#ad8a63", metalness: 0.05, canopy: "timber" },
};

export function frontageState(p: Property) {
  const work = buildingWorkState(p);
  const working = work.active;
  const occupancy = p.capacity > 0 ? Math.max(0, Math.min(1, p.tenants.length / p.capacity)) : 0;
  // Occupied phased renovations retain local life. Full closures do not.
  const open = p.status === "klar" && occupancy > 0;
  return { working, occupancy, open, vacant: p.status === "klar" && occupancy === 0,
    restored: p.condition >= 70, worn: p.condition < 40,
    facadeUpgrade: p.upgrades.includes("fasad"),
    label: working ? work.label : !open ? "TO LET" : p.type === "bostad" ? "" : p.tenants[0]?.name ?? "OPEN" };
}

export type FrontageSurface = "stone" | "frame" | "accent" | "wood" | "dark" | "glass" | "warm" | "green";
export interface FrontageBox { x: number; y: number; z: number; sx: number; sy: number; sz: number; }
export type FrontageParts = Record<FrontageSurface, FrontageBox[]>;

/** All geometry is in facade coordinates: wall at z=0, outward is +z.
 * Opaque recesses and narrow reflection strips suggest interior depth without
 * transmission, point lights, or transparent sorting. Maximum overhang: 0.9. */
export function frontageParts(width: number, district: string, p: Property, low = false): FrontageParts {
  const parts: FrontageParts = { stone: [], frame: [], accent: [], wood: [], dark: [], glass: [], warm: [], green: [] };
  if (width < 2) return parts;
  const style = DISTRICT_FRONTAGES[district] ?? DISTRICT_FRONTAGES.kulle;
  const state = frontageState(p);
  const w = width * 0.92;
  const door = Math.min(p.type === "industri" ? 5.4 : 1.7, w * 0.42);
  const top = p.type === "industri" ? 4.5 : 3.15;
  const add = (surface: FrontageSurface, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    parts[surface].push({ x, y, z, sx, sy, sz });
  const frame = (x: number, bw: number, bh: number) => {
    add("dark", x, bh / 2 + 0.15, 0.26, bw, bh, 0.12);
    for (const side of [-1, 1]) add("frame", x + side * (bw / 2 + 0.07), bh / 2 + 0.15, 0.48, 0.14, bh + 0.22, 0.36);
    add("frame", x, bh + 0.2, 0.48, bw + 0.28, 0.16, 0.36);
    add("stone", x, 0.13, 0.49, bw + 0.28, 0.18, 0.48);
  };
  // A solid ground-floor surround masks the old flat storefront tile underneath.
  add("stone", 0, top / 2, 0.12, w, top, 0.2);
  frame(0, door, top - 0.3);
  add("glass", 0, top / 2, 0.38, door * 0.88, top - 0.65, 0.06);
  add("frame", door * 0.27, 1.3, 0.6, 0.065, 0.5, 0.08);
  if (state.open) add("warm", 0, top - 0.5, 0.51, door * 0.74, 0.12, 0.05);

  if (p.type === "industri") {
    // Roller shutter, bumpers and hazard bands rather than a retail window.
    add("frame", 0, top / 2, 0.48, door, top - 0.4, 0.12);
    if (!low) for (let y = 0.4; y < top; y += 0.32) add("dark", 0, y, 0.55, door, 0.045, 0.05);
    for (const side of [-1, 1]) {
      add("dark", side * (door / 2 + 0.26), 0.55, 0.6, 0.3, 0.8, 0.32);
      add("accent", side * (door / 2 + 0.26), 0.9, 0.79, 0.3, 0.14, 0.04);
    }
    if (state.open && !low && w > 9) {
      add("wood", w * 0.36, 0.45, 0.45, 1.1, 0.9, 0.7);
      add("accent", w * 0.36, 0.45, 0.82, 0.1, 0.9, 0.04);
    }
  } else if (p.type === "bostad") {
    // Residential lobbies: raised windows and letterboxes, never retail displays.
    const bw = Math.min(1.65, (w - door) / 2 - 0.6);
    if (bw > 0.5) for (const side of [-1, 1]) {
      const x = side * (door / 2 + 0.45 + bw / 2);
      add("frame", x, 1.85, 0.35, bw + 0.16, 1.4, 0.22);
      add("glass", x, 1.85, 0.49, bw, 1.22, 0.07);
      add("stone", x, 1.08, 0.52, bw + 0.3, 0.12, 0.4);
      if (state.open) add("warm", x, 2.35, 0.54, bw * 0.65, 0.09, 0.03);
    }
    if (!low && w > 7) for (let i = 0; i < 3; i++)
      add("frame", -w * 0.36, 0.8 + i * 0.28, 0.36, 0.52, 0.22, 0.2);
  } else {
    const room = (w - door) / 2 - 0.6;
    if (room > 0.7) for (const side of [-1, 1]) {
      const bw = Math.min(room, 4.5), x = side * (door / 2 + 0.35 + bw / 2);
      frame(x, bw, top - 0.6);
      // Furnished bays scale with actual occupancy; empty units stay dark.
      const occupied = state.open && (side === -1 || state.occupancy > 0.5);
      if (occupied) {
        add("warm", x, top - 0.65, 0.34, bw * 0.87, 0.12, 0.04);
        if (!low) {
          add("wood", x, 0.95, 0.43, bw * 0.78, 0.12, 0.22);
          if (p.type === "butik") for (let i = 0; i < 3; i++) {
            add(i === 1 ? "accent" : "wood", x + (i - 1) * bw * 0.23, 1.25 + i * 0.08, 0.44, bw * 0.16, 0.48 + i * 0.16, 0.2);
          } else {
            add("stone", x, 0.6, 0.43, bw * 0.52, 0.6, 0.25);
            add("green", x + bw * 0.3, 1.18, 0.46, bw * 0.16, 0.55, 0.2);
          }
        }
      }
      // Glass is a slim reflective edge so the display remains visible.
      add("glass", x + bw * 0.32, 1.6, 0.64, bw * 0.12, 1.7, 0.04);
      if (state.worn && state.vacant && !low) for (const y of [0.85, 1.5]) add("wood", x, y, 0.69, bw * 0.94, 0.2, 0.08);
    }
  }

  const canopyWidth = Math.min(w, p.type === "butik" ? w * 0.94 : door + 1);
  add("accent", 0, top + 0.38, 0.47, canopyWidth, style.canopy === "cornice" ? 0.24 : 0.13, 0.86);
  if (style.canopy === "timber" && !low) for (const side of [-1, 1]) add("wood", side * (canopyWidth / 2 - 0.12), top - 0.05, 0.55, 0.13, 0.75, 0.4);
  if (style.canopy === "industrial") add("accent", 0, top + 0.02, 0.49, canopyWidth, 0.28, 0.3);
  if (state.restored) {
    add("stone", 0, 0.05, 0.42, w, 0.1, 0.8);
    if (!low) for (const side of [-1, 1]) {
      add("frame", side * Math.min(w * 0.4, door / 2 + 0.45), top - 0.25, 0.57, 0.28, 0.55, 0.25);
      if (state.open) add("warm", side * Math.min(w * 0.4, door / 2 + 0.45), top - 0.25, 0.71, 0.18, 0.36, 0.04);
    }
  }
  if (!low && w > 3) {
    // Intercom, accessible door handle and a sheltered entry light.
    add("frame", door / 2 + 0.32, 1.35, 0.58, 0.18, 0.35, 0.1);
    add("dark", door / 2 + 0.32, 1.41, 0.64, 0.11, 0.12, 0.02);
    add("frame", 0, top + 0.18, 0.76, 0.55, 0.12, 0.18);
    if (state.open) add("warm", 0, top + 0.12, 0.77, 0.4, 0.055, 0.12);
  }
  if (state.facadeUpgrade) {
    add("frame", 0, top + 0.62, 0.23, w, 0.14, 0.36);
    for (const side of [-1, 1]) add("stone", side * (w / 2 - 0.16), top / 2, 0.3, 0.3, top, 0.25);
  }
  return parts;
}
