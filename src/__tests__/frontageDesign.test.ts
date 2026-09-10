import { describe, expect, it } from "vitest";
import { DISTRICT_FRONTAGES, frontageParts, frontageState } from "../three/frontageDesign";
import { streetFront } from "../three/frontagePlacement";
import { visualProgress, visualSnapshot } from "../three/visualProgress";
import { appearanceKey } from "../three/propertyAppearance";
import { PARCELS, parcelHash } from "../engine/city";
import { makeProperty, makeTenantFixture } from "./factories";
import type { PropTypeKey } from "../engine/types";

const occupied = makeProperty({ type: "butik", tenants: [makeTenantFixture()], capacity: 2 });
const snapshot = (p = occupied, owned = true) => visualSnapshot(p, owned);

describe("next-level frontage", () => {
  it("has a distinct stable palette for every district", () => {
    expect(Object.keys(DISTRICT_FRONTAGES)).toHaveLength(7);
    expect(new Set(Object.values(DISTRICT_FRONTAGES).map(p => p.accent)).size).toBe(7);
  });
  it("furnishes bays according to occupancy and leaves vacant units unlit", () => {
    const empty = frontageParts(17, "centrum", { ...occupied, tenants: [] });
    const half = frontageParts(17, "centrum", occupied);
    const full = frontageParts(17, "centrum", { ...occupied, capacity: 1 });
    expect(empty.warm).toHaveLength(0);
    expect(half.wood.length).toBeGreaterThan(empty.wood.length);
    expect(full.warm.length).toBeGreaterThan(half.warm.length);
  });
  it("keeps an occupied phased renovation alive, but closes a full refurbishment", () => {
    expect(frontageState({ ...occupied, phased: { done: 1, total: 3, monthsLeft: 2 } })).toMatchObject({ open: true, working: true });
    expect(frontageState({ ...occupied, status: "bygger", renovation: { kind: "totalrenovering" } })).toMatchObject({ open: false, working: true });
  });
  it("shows completed facade upgrades, not merely ordered work", () => {
    const base = frontageParts(17, "centrum", occupied);
    const ordered = frontageParts(17, "centrum", { ...occupied, pendingWorks: [{ kind: "uppgradering", upgradeId: "fasad", monthsLeft: 2 }] });
    expect(ordered).toEqual(base);
    const completed = frontageParts(17, "centrum", { ...occupied, upgrades: ["fasad"] });
    expect(completed.stone.length).toBeGreaterThan(base.stone.length);
    expect(completed.frame.length).toBeGreaterThan(base.frame.length);
  });
  it("keeps geometry within its facade width and a shallow pavement overhang", () => {
    for (const district of Object.keys(DISTRICT_FRONTAGES)) for (const width of [2, 3, 5.5, 17, 27, 80]) {
      for (const type of ["bostad", "butik", "kontor", "industri"] as PropTypeKey[]) {
        for (const condition of [25, 85]) for (const low of [false, true]) {
          const parts = frontageParts(width, district, { ...occupied, type, condition, upgrades: ["fasad"] }, low);
          const boxes = Object.values(parts).flat();
          expect(boxes.length).toBeLessThan(110);
          for (const b of boxes) {
            expect(Math.abs(b.x) + b.sx / 2).toBeLessThanOrEqual(width / 2 + 0.001);
            expect(b.z - b.sz / 2).toBeGreaterThanOrEqual(0);
            expect(b.z + b.sz / 2).toBeLessThanOrEqual(0.901);
            expect(b.y - b.sy / 2).toBeGreaterThanOrEqual(-0.001);
          }
        }
      }
    }
  });
  it("reduces geometry on Low without losing the doorway", () => {
    const high = frontageParts(17, "centrum", occupied);
    const low = frontageParts(17, "centrum", occupied, true);
    expect(Object.values(low).flat().length).toBeLessThan(Object.values(high).flat().length);
    expect(low.dark.length).toBe(high.dark.length);
    expect(low.glass.length).toBeGreaterThan(0);
  });
  it("places harbor and villa details on the actual fixed south-facing buildings", () => {
    for (const [district, ws, ds] of [["hamnen", 0.9, 0.78], ["kulle", 0.55, 0.55]] as const) {
      const parcel = PARCELS.find(p => p.district === district)!;
      const front = streetFront({ ...parcel, edges: { n: true, s: false, e: false, w: false } })!;
      expect(front.rotation).toBe(0);
      expect(front.width).toBeCloseTo(parcel.w * ws); expect(front.depth).toBeCloseTo(parcel.d * ds);
    }
  });
  it("aligns finance entrances with the podium and suburb entrances with the courtyard", () => {
    const finance = PARCELS.find(p => p.district === "finans" && p.edges.s)!;
    const scale = (parcelHash(finance.id) >> 3) % 2 === 0 ? 0.92 : 0.72;
    expect(streetFront(finance)?.depth).toBeCloseTo(finance.d * scale);
    const suburb = PARCELS.find(p => p.district === "förort")!;
    const front = streetFront(suburb)!;
    expect(front.depth).toBe(9); expect(front.z).toBeCloseTo(-suburb.d / 2 + 7);
    expect(front.x).toBeLessThan(0);
  });
  it("invalidates tenant signage without invalidating normal rent ticks", () => {
    expect(appearanceKey({ ...occupied, tenants: [{ ...occupied.tenants[0], name: "New tenant" }] })).not.toBe(appearanceKey(occupied));
    expect(appearanceKey({ ...occupied, tenants: [{ ...occupied.tenants[0], monthsLeft: 4 }] })).toBe(appearanceKey(occupied));
  });
});

describe("visual rewards", () => {
  it("distinguishes acquisition, leasing and completed investment", () => {
    expect(visualProgress(snapshot(occupied, false), snapshot())).toBe("purchase");
    expect(visualProgress(snapshot({ ...occupied, tenants: [] }), snapshot())).toBe("lease");
    expect(visualProgress(snapshot(), snapshot({ ...occupied, upgrades: ["fasad"] }))).toBe("renewal");
    expect(visualProgress(snapshot(), snapshot({ ...occupied, devLevel: 1 }))).toBe("completed");
  });
  it("does not reward bills, starting/cancelling works, or another property's changes", () => {
    for (const after of [
      { ...occupied, askPrice: 9_000_000 },
      { ...occupied, pendingWorks: [{ kind: "underhåll" as const, monthsLeft: 2 }] },
      { ...occupied, upgrades: ["bredband"] },
      { ...occupied, condition: 85 }, { ...occupied, id: 2 },
    ]) expect(visualProgress(snapshot(), snapshot(after))).toBeNull();
    expect(visualProgress(snapshot({ ...occupied, status: "bygger" }), snapshot())).toBeNull();
  });
  it("ignores competitors' outcomes and rewards energy improvements", () => {
    const improved = { ...occupied, energyClass: "A" as const };
    expect(visualProgress(snapshot(occupied, false), snapshot(improved, false))).toBeNull();
    expect(visualProgress(snapshot({ ...occupied, energyClass: "D" }), snapshot(improved))).toBe("renewal");
  });
});
