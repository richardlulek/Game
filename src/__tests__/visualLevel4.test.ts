import { describe, expect, it } from "vitest";
import { PARCELS, parcelsForLayout } from "../engine/city";
import { generateCityLayout } from "../engine/cityLayout";
import { makeProperty, makeTenantFixture } from "./factories";
import { buildingWorkState } from "../three/buildingWorkState";
import { frontageParts } from "../three/frontageDesign";
import { appearanceKey } from "../three/propertyAppearance";
import { groundsPlan, insidePlot, overlaps } from "../three/groundsLayout";
import { inspectionPose } from "../three/inspectionView";
import { useUiStore } from "../store/uiStore";

describe("patch 4: visible property use", () => {
  it("ignores non-physical campaigns and waits for actual completed upgrades", () => {
    const p = makeProperty({ pendingWorks: [{ kind: "kampanj", monthsLeft: 1 }] });
    expect(buildingWorkState(p).active).toBe(false);
    expect(buildingWorkState(makeProperty({ pendingWorks: [{ kind: "uppgradering", upgradeId: "smart", monthsLeft: 1 }] })).active).toBe(false);
    expect(buildingWorkState(makeProperty({ upgrades: ["fasad"] })).active).toBe(false);
  });
  it("tracks facade work from its real duration and removes work on completion", () => {
    const p = makeProperty({ pendingWorks: [{ kind: "uppgradering", upgradeId: "fasad", monthsLeft: 2 }] });
    expect(buildingWorkState(p)).toMatchObject({ stage: "setup", scaffold: true, facadeProgress: 0 });
    const next = { ...p, pendingWorks: [{ ...p.pendingWorks![0], monthsLeft: 1 }] };
    expect(buildingWorkState(next)).toMatchObject({ stage: "work", facadeProgress: 0.5 });
    expect(appearanceKey(next)).not.toBe(appearanceKey(p));
    expect(buildingWorkState({ ...next, pendingWorks: [], upgrades: ["fasad"] }).active).toBe(false);
  });
  it("distinguishes minor maintenance from major and phased work", () => {
    expect(buildingWorkState(makeProperty({ pendingWorks: [{ kind: "underhåll", monthsLeft: 1 }] }))).toMatchObject({ active: true, scaffold: false });
    expect(buildingWorkState(makeProperty({ renovation: { kind: "totalrenovering" }, buildLeft: 1 }))).toMatchObject({ stage: "finishing", scaffold: true });
    const p = makeProperty({ phased: { done: 2, total: 4, monthsLeft: 1 } });
    expect(buildingWorkState(p)).toMatchObject({ progress: 0.625, label: "STAGE 3/4", facadeProgress: 0, scaffold: false });
    expect(buildingWorkState({ ...p, phased: undefined }).active).toBe(false);
  });
  it("does not board occupied shop windows or furnish residential windows as shops", () => {
    const occupied = makeProperty({ type: "butik", condition: 20, tenants: [makeTenantFixture()] });
    const boarded = frontageParts(18, "centrum", { ...occupied, tenants: [] });
    const open = frontageParts(18, "centrum", occupied);
    expect(boarded.wood.some(p => p.z === 0.69)).toBe(true);
    expect(open.wood.some(p => p.z === 0.69)).toBe(false);
    expect(frontageParts(18, "centrum", { ...occupied, type: "bostad" }).wood).toEqual([]);
  });
  it("fits amenities without obstructing paths or buildings in classic and generated cities", () => {
    let fitted = 0, parking = 0;
    for (const parcels of [PARCELS, parcelsForLayout(generateCityLayout(731))]) {
      for (const district of ["kulle", "förort", "centrum", "innerstad", "industri", "hamnen", "finans"]) {
        for (const p of parcels.filter(p => p.district === district).slice(0, 12)) {
          const plan = groundsPlan(p, district === "industri" ? "industri" : "bostad");
          expect(plan.amenities.length).toBeLessThanOrEqual(4);
          for (const [i, a] of plan.amenities.entries()) {
            fitted++;
            expect(insidePlot(a, p)).toBe(true);
            expect([...plan.obstacles, ...plan.paving, ...plan.beds, ...plan.amenities.slice(i + 1)].some(r => overlaps(a, r, 0.24))).toBe(false);
            if (a.kind === "parking" || a.kind === "loading") {
              parking++;
              expect(a.rotation === 0 ? (a.z > 0 ? p.edges.s : p.edges.n) : (a.x > 0 ? p.edges.e : p.edges.w)).toBe(true);
            }
          }
        }
      }
    }
    expect(fitted).toBeGreaterThan(10);
    expect(parking).toBeGreaterThan(0);
  });
  it("never parks cars inside dense city buildings", () => {
    for (const p of PARCELS.filter(p => p.district === "centrum").slice(0, 15)) expect(groundsPlan(p).amenities).toEqual([]);
  });
});

describe("property inspection", () => {
  const front = { x: 100, z: 200, rotation: 0, depth: 20, width: 25 };
  const bounds = { x: 100, z: 200, w: 25, d: 20, h: 30 };
  it("fits the entire bounding sphere within the vertical camera field", () => {
    for (const h of [9, 30, 150, 250]) {
      const pose = inspectionPose({ ...bounds, h }, front, "building", 0);
      const distance = Math.hypot(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z);
      expect(distance * Math.sin(38 * Math.PI / 360)).toBeGreaterThan(Math.hypot(25, h, 20) / 2);
    }
  });
  it("looks at opposite facades and the actual shared suburb courtyard", () => {
    const entrance = inspectionPose(bounds, front, "entrance", 0);
    const yard = inspectionPose(bounds, front, "yard", 0);
    expect(entrance.target.z).toBeGreaterThan(front.z);
    expect(yard.target.z).toBeLessThan(front.z);
    expect(entrance.position.z).toBeGreaterThan(entrance.target.z);
    expect(yard.position.z).toBeLessThan(yard.target.z);
    expect(inspectionPose(bounds, front, "yard", 0, 38, { x: 100, z: 200 }).target).toEqual({ x: 100, y: 1, z: 200 });
  });
  it("rotates around a stable target at the same distance", () => {
    const a = inspectionPose(bounds, front, "building", 0), b = inspectionPose(bounds, front, "building", 2);
    expect(a.target).toEqual(b.target);
    expect(Math.hypot(a.position.x - a.target.x, a.position.z - a.target.z)).toBeCloseTo(Math.hypot(b.position.x - b.target.x, b.position.z - b.target.z));
  });
  it("lets manual control interrupt flight and ordinary focus exit inspection", () => {
    useUiStore.getState().inspect("test", "entrance");
    expect(useUiStore.getState().inspection?.view).toBe("entrance");
    useUiStore.getState().cancelFocus();
    expect(useUiStore.getState().focusParcelId).toBeNull();
    useUiStore.getState().requestFocus("test", 125);
    expect(useUiStore.getState().inspection).toBeNull();
    useUiStore.getState().select(null);
  });
});
