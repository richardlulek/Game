import { describe, expect, it } from "vitest";
import { PARCELS } from "../engine/city";
import { appearanceKey, propertyAppearance } from "../three/propertyAppearance";
import { makeProperty, makeTenantFixture } from "./factories";
import { GRAPHICS_PRESETS } from "../store/prefs";

const parcel = PARCELS.find(p => p.district === "centrum")!;

describe("simulation-driven streetscape", () => {
  it("turns a vacant storefront into an active one when its first lease is signed", () => {
    const empty = makeProperty({ type: "butik", capacity: 2 });
    const occupied = { ...empty, tenants: [makeTenantFixture()] };
    expect(propertyAppearance(parcel, empty)).toMatchObject({ active: false, variant: "släckt", occupancy: 0 });
    expect(propertyAppearance(parcel, occupied)).toMatchObject({ active: true, variant: "normal", occupancy: 0.5 });
    expect(propertyAppearance(parcel, { ...occupied, capacity: 1 }).variant).toBe("tänt");
  });

  it("shows scaffolding only for physical work, and removes it when work completes", () => {
    const base = makeProperty();
    const underway = { ...base, pendingWorks: [{ kind: "uppgradering" as const, upgradeId: "fasad", monthsLeft: 2 }] };
    expect(propertyAppearance(parcel, underway).renovating).toBe(true);
    expect(propertyAppearance(parcel, { ...base, pendingWorks: [{ kind: "kampanj", monthsLeft: 1 }] }).renovating).toBe(false);
    expect(propertyAppearance(parcel, { ...base, upgrades: ["fasad"], pendingWorks: [] }).renovating).toBe(false);
    expect(propertyAppearance(parcel, { ...base, phased: { done: 1, total: 3, monthsLeft: 2 } }).renovating).toBe(true);
    expect(propertyAppearance(parcel, { ...base, pendingWorks: [{ kind: "energi", monthsLeft: 1 }] }).renovating).toBe(true);
  });

  it("keeps the architectural color when ownership or financial values change", () => {
    const property = makeProperty();
    expect(propertyAppearance(parcel, { ...property, owned: false, purchasePrice: 999, askPrice: 999 }).color)
      .toBe(propertyAppearance(parcel, property).color);
  });

  it("makes repaired buildings and completed facade work visibly different", () => {
    const worn = makeProperty({ condition: 25 });
    const repaired = { ...worn, condition: 85, upgrades: ["fasad"] };
    expect(propertyAppearance(parcel, worn)).toMatchObject({ variant: "sliten", caredFor: false });
    expect(propertyAppearance(parcel, repaired).caredFor).toBe(true);
    expect(propertyAppearance(parcel, repaired).color).not.toBe(propertyAppearance(parcel, worn).color);
  });

  it("never mutates a property while deriving its appearance", () => {
    const property = makeProperty();
    const before = JSON.stringify(property);
    propertyAppearance(parcel, property); appearanceKey(property);
    expect(JSON.stringify(property)).toBe(before);
  });
});

describe("property thumbnail invalidation", () => {
  it("retains cached images through ordinary financial and lease-duration updates", () => {
    const p = makeProperty({ tenants: [makeTenantFixture()] });
    expect(appearanceKey({ ...p, askPrice: 50, totalEarnedRent: 42, tenants: [{ ...p.tenants[0], monthsLeft: 6 }] })).toBe(appearanceKey(p));
  });
  it("invalidates images for construction, repairs, leasing, energy and facade changes", () => {
    const p = makeProperty();
    for (const change of [
      { condition: 35 }, { status: "bygger" as const, buildLeft: 4 },
      { tenants: [makeTenantFixture()] }, { energyClass: "A" as const },
      { upgrades: ["fasad"] }, { devLevel: 1 },
    ]) expect(appearanceKey({ ...p, ...change })).not.toBe(appearanceKey(p));
  });
});

it("keeps detail thresholds reachable, hysteretic and city life present at every quality", () => {
  for (const preset of Object.values(GRAPHICS_PRESETS)) {
    expect(preset.lodEnter).toBeLessThan(1000);
    expect(preset.lodExit).toBeLessThan(preset.lodEnter);
    expect(preset.population).toBeGreaterThan(0);
  }
});
