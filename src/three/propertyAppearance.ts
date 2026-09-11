import { Color } from "three";
import type { Parcel } from "../engine/city";
import { parcelHash } from "../engine/city";
import type { Property } from "../engine/types";
import { PALETTE_CENTRUM, PALETTE_FINANS, PALETTE_FORORT, PALETTE_FUNKIS, PALETTE_HAMN, PALETTE_INDUSTRI, PALETTE_TEGEL, PALETTE_VILLA } from "./colors";
import type { FacadeVariant } from "./textures";
import { frontageState } from "./frontageDesign";

/** Visual state is derived from the simulation; it never changes saves or economics. */
export function propertyAppearance(parcel: Parcel, p: Property) {
  const seed = parcelHash(parcel.id);
  const { occupancy, working: renovating } = frontageState(p);
  const variant: FacadeVariant = p.condition < 40 ? "sliten" : occupancy === 0 ? "släckt" : occupancy >= 1 ? "tänt" : "normal";
  const color = new Color(propertyFacadeColor(parcel.district, seed, p.type, p.condition, p.upgrades.includes("fasad")));
  return { color: `#${color.getHexString()}`, variant, occupancy, renovating,
    active: p.status === "klar" && occupancy > 0,
    caredFor: p.condition >= 70,
    solar: p.energyClass === "A" || p.energyClass === "B" };
}

/** Stable across cash/lease ticks; invalidate previews only for a visual change. */
export function appearanceKey(p: Property): string {
  return [p.id, p.parcelId, p.type, p.area, Math.round(p.condition), p.tenants.length, p.capacity,
    p.status, p.buildLeft, p.devLevel, p.energyClass, p.storyTag, p.signature,
    p.upgrades.join(","), p.tenants.map(t => t.name).join(";"), p.phased?.done, p.phased?.monthsLeft, p.renovation?.kind,
    p.pendingWorks?.map(w => `${w.kind}:${w.upgradeId ?? ""}:${w.monthsLeft}`).join(",")].join("|");
}

export function propertyFacadeColor(district: Parcel["district"], seed: number, type: Property["type"], condition: number, facadeUpgrade = false) {
  const palette = type === "industri" ? (district === "hamnen" ? PALETTE_HAMN : PALETTE_INDUSTRI)
    : district === "finans" ? PALETTE_FINANS
    : district === "kulle" ? PALETTE_VILLA
    : district === "förort" ? PALETTE_FORORT
    : district === "centrum" ? PALETTE_CENTRUM
    : seed % 2 ? PALETTE_TEGEL : PALETTE_FUNKIS;
  const color = new Color(palette[seed % palette.length]);
  color.lerp(new Color("#756e64"), Math.max(0, 100 - condition) / 100 * 0.38);
  if (facadeUpgrade) color.lerp(new Color("#eee6d8"), 0.1);
  return `#${color.getHexString()}`;
}
