import { describe, expect, it } from "vitest";
import { activeCitySeed, setActiveCityLayout } from "../engine/activeLayout";
import {
  DISTRICT_ZONES,
  PARCELS,
  PLAN_AREAS,
  ZONE_DEFS,
  ZONE_STREETS,
  districtZonesFor,
  parcelById,
  parcelsForLayout,
} from "../engine/city";
import { CLASSIC_SEED, generateCityLayout } from "../engine/cityLayout";
import { reducer } from "../engine";
import { landmarksForLayout } from "../engine/landmarkGen";
import { roadsForLayout } from "../engine/roadGen";
import { LANDMARKS } from "../three/landmarks";
import { ROADS } from "../three/roadNet";

/* Vakt för det aktiva kartbytet: setActiveCityLayout ska mutera ALLA
   exporterade konstanter på plats (motorn, 3D-vyn och UI:t läser dem
   direkt), och ett byte tillbaka till klassisk ska vara exakt.
   OBS: filen muterar modultillstånd – vitest isolerar per testfil, så
   övriga tester ser aldrig något annat än klassiska kartan. */

const snapshot = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("AKTIV LAYOUT: kartbytet muterar de delade konstanterna korrekt", () => {
  const classicParcels = snapshot(PARCELS);
  const classicZones = snapshot(ZONE_DEFS);
  const classicDistricts = snapshot(DISTRICT_ZONES);
  const classicStreets = snapshot(ZONE_STREETS);
  const classicRoads = snapshot(ROADS);
  const classicLandmarks = snapshot(LANDMARKS);
  const classicPlanAreas = snapshot(PLAN_AREAS);

  it("byter till en seedad stad och tillbaka till exakt klassisk", () => {
    expect(activeCitySeed()).toBe(CLASSIC_SEED);

    setActiveCityLayout(5);
    expect(activeCitySeed()).toBe(5);
    const layout5 = generateCityLayout(5);
    expect(snapshot(ZONE_DEFS)).toEqual(layout5.zones);
    expect(snapshot(PARCELS)).toEqual(parcelsForLayout(layout5));
    expect(snapshot(DISTRICT_ZONES)).toEqual(districtZonesFor(layout5.zones));
    const roads5 = roadsForLayout(layout5);
    expect(snapshot(ROADS)).toEqual(roads5);
    expect(snapshot(LANDMARKS)).toEqual(landmarksForLayout(layout5, roads5));
    expect(snapshot(PLAN_AREAS)).toEqual(layout5.expansions.filter((e) => e.kind === "plan"));
    // Uppslag via id går mot nya kartan.
    const p = PARCELS.find((x) => x.district === "centrum")!;
    expect(parcelById(p.id)).toBe(p);
    // Gatunätet är omräknat för de flyttade zonerna.
    expect(snapshot(ZONE_STREETS)).not.toEqual(classicStreets);

    setActiveCityLayout(undefined); // tillbaka till klassisk
    expect(activeCitySeed()).toBe(CLASSIC_SEED);
    expect(snapshot(ZONE_DEFS)).toEqual(classicZones);
    expect(snapshot(PARCELS)).toEqual(classicParcels);
    expect(snapshot(DISTRICT_ZONES)).toEqual(classicDistricts);
    expect(snapshot(ZONE_STREETS)).toEqual(classicStreets);
    expect(snapshot(ROADS)).toEqual(classicRoads);
    expect(snapshot(LANDMARKS)).toEqual(classicLandmarks);
    expect(snapshot(PLAN_AREAS)).toEqual(classicPlanAreas);
  });

  it("RESET bär stadsfröet in i tillståndet – kampanjen förblir klassisk", () => {
    const random = reducer(undefined as never, {
      type: "RESET",
      scenarioId: "sandbox",
      options: { citySeed: 42, seed: 1 },
    } as never);
    expect(random.citySeed).toBe(42);

    const story = reducer(undefined as never, {
      type: "RESET",
      scenarioId: "arvet",
      mode: "story",
    } as never);
    expect(story.citySeed).toBeUndefined();

    const classic = reducer(undefined as never, {
      type: "RESET",
      scenarioId: "sandbox",
      options: { seed: 1 },
    } as never);
    expect(classic.citySeed).toBeUndefined();
  });
});
