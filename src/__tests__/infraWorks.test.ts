/* 3D-infrastrukturens placeringslogik: invigda projekt och pågående
   kommunala byggen får deterministiska platser vid distriktets kant. */

import { describe, expect, it } from "vitest";
import { PARCELS } from "../engine/city";
import { infraSpotsFor } from "../three/infraSpots";
import type { GameState } from "../engine/types";
import { makeState } from "./factories";

describe("INFRASTRUKTUREN PÅ KARTAN: deterministisk placering", () => {
  it("invigda projekt får platser vid distriktets södra kant", () => {
    const s = makeState({
      infraBuilt: [
        { kind: "tunnelbana", district: "centrum", access: 0.14, openedAbs: 0 },
        { kind: "stadspark", district: "centrum", access: 0.04, openedAbs: 5 },
      ],
    }) as GameState;
    const spots = infraSpotsFor(s);
    expect(spots).toHaveLength(2);
    for (const spot of spots) {
      expect(spot.progress).toBe(1);
      // Inom distriktets x-spann, strax söder om dess kant.
      const xs = PARCELS.filter((p) => p.district === "centrum");
      const minX = Math.min(...xs.map((p) => p.x - p.w / 2));
      const maxX = Math.max(...xs.map((p) => p.x + p.w / 2));
      expect(spot.x).toBeGreaterThanOrEqual(minX);
      expect(spot.x).toBeLessThanOrEqual(maxX);
      const maxZ = Math.max(...xs.map((p) => p.z + p.d / 2));
      expect(spot.z).toBeGreaterThan(maxZ);
    }
    // Två projekt i samma distrikt står inte på varandra.
    expect(spots[0].x).not.toBe(spots[1].x);
  });

  it("pågående byggen får progress ur månaderna", () => {
    const s = makeState({
      infraProjects: [
        { id: 1, name: "Metro line", district: "hamnen", districtName: "Hamnen", monthsLeft: 12, totalMonths: 36, boost: 0.1, kindId: "tunnelbana" },
      ],
    }) as GameState;
    const spots = infraSpotsFor(s);
    expect(spots).toHaveLength(1);
    expect(spots[0].progress).toBeCloseTo(1 - 12 / 36, 3);
    expect(spots[0].progress).toBeLessThan(1);
  });

  it("okänt distrikt ignoreras i stället för att krascha", () => {
    const s = makeState({
      infraBuilt: [{ kind: "skola", district: "atlantis", access: 0.04, openedAbs: 0 }],
    }) as GameState;
    expect(infraSpotsFor(s)).toHaveLength(0);
  });
});
