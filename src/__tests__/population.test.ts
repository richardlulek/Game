import { describe, expect, it } from "vitest";
import { applicationRate } from "../engine/leasing";
import {
  BASE_POPULATION,
  cityJobs,
  cityPopulation,
  housingPressure,
} from "../engine/population";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* Befolkningsloopen: jobb → inflyttning → bostadstryck → ansökningsflöde.
   Kedjan ska vara kausal: fler arbetsplatser i staden drar in invånare
   (upp till bostadstaket), och bostadsbrist ger fler sökande per hus. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("BEFOLKNINGSLOOPEN: jobb driver inflyttning som driver efterfrågan", () => {
  it("initieras vid första ticket och ligger nära jämvikt utan spelare", () => {
    seedRng(3);
    try {
      let s = makeState({});
      for (let m = 0; m < 12; m++) s = tick(s);
      const pop = cityPopulation(s);
      const base = Object.values(BASE_POPULATION).reduce((a, b) => a + b, 0);
      expect(pop).toBeGreaterThan(base * 0.85);
      expect(pop).toBeLessThan(base * 1.2);
    } finally {
      clearRng();
    }
  });

  it("fler arbetsplatser → staden växer (mot bostadstaket)", () => {
    seedRng(5);
    try {
      // 30 kontorshus i staden = tusentals nya jobb.
      const offices = Array.from({ length: 30 }, (_, i) =>
        makeProperty({ id: 8100 + i, type: "kontor", capacity: 6, parcelId: undefined }),
      );
      let jobsState = makeState({ portfolio: offices, cash: 100_000_000 });
      let calm = makeState({ cash: 100_000_000 });
      expect(cityJobs(jobsState)).toBeGreaterThan(cityJobs(calm) + 5_000);
      for (let m = 0; m < 24; m++) {
        jobsState = tick(jobsState);
        calm = tick(calm);
      }
      expect(cityPopulation(jobsState)).toBeGreaterThan(cityPopulation(calm) + 1_000);
    } finally {
      clearRng();
    }
  });

  it("bostadsbrist ger fler sökande till bostadshus", () => {
    const shortage = makeState({
      population: Object.fromEntries(
        Object.entries(BASE_POPULATION).map(([d, p]) => [d, Math.round(p * 1.25)]),
      ),
    });
    const surplus = makeState({
      population: Object.fromEntries(
        Object.entries(BASE_POPULATION).map(([d, p]) => [d, Math.round(p * 0.7)]),
      ),
    });
    const bostad = makeProperty({ id: 9500, type: "bostad", capacity: 6, parcelId: undefined });
    expect(housingPressure(shortage, "kulle")).toBeGreaterThan(1.1);
    expect(applicationRate(bostad, shortage, 1)).toBeGreaterThan(
      applicationRate(bostad, surplus, 1) * 1.3,
    );
  });

  it("bostadstaket bromsar tillväxten – befolkningen kan inte överstiga stocken", () => {
    seedRng(7);
    try {
      // Extremt jobbtungt läge utan nya bostäder.
      const offices = Array.from({ length: 80 }, (_, i) =>
        makeProperty({ id: 8600 + i, type: "kontor", capacity: 8, parcelId: undefined }),
      );
      let s = makeState({ portfolio: offices, cash: 100_000_000 });
      for (let m = 0; m < 60; m++) s = tick(s);
      const totalHousing = Object.keys(BASE_POPULATION).reduce(
        (a, d) => a + (s.population?.[d] ?? 0) / Math.max(0.01, housingPressure(s, d)),
        0,
      );
      // Trycket får aldrig passera trångboddhetstaket ~1,06 nämnvärt.
      for (const d of Object.keys(BASE_POPULATION))
        expect(housingPressure(s, d)).toBeLessThan(1.15);
      expect(totalHousing).toBeGreaterThan(0);
    } finally {
      clearRng();
    }
  });

  it("tickPopulation loggar milstolpar", () => {
    seedRng(11);
    try {
      const s = makeState({
        population: Object.fromEntries(
          Object.entries(BASE_POPULATION).map(([d, p]) => [d, p]),
        ),
      });
      // Tvinga ett stort hopp genom att ge staden enorma jobb och kolla att
      // milstolpeloggen dyker upp inom rimlig tid.
      const offices = Array.from({ length: 60 }, (_, i) =>
        makeProperty({ id: 8800 + i, type: "kontor", capacity: 8, parcelId: undefined }),
      );
      const bostäder = Array.from({ length: 120 }, (_, i) =>
        makeProperty({ id: 9000 + i, type: "bostad", capacity: 8, parcelId: undefined }),
      );
      let st = { ...s, portfolio: [...offices, ...bostäder] };
      let milestone = false;
      for (let m = 0; m < 36 && !milestone; m++) {
        st = tick(st);
        milestone = st.log.some((l) => l.t.includes("The city passes"));
      }
      expect(milestone).toBe(true);
    } finally {
      clearRng();
    }
  });
});
