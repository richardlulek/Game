import { describe, expect, it } from "vitest";
import { reducer } from "../engine";
import { advanceMonth } from "../engine/simulation";
import { PROPERTY_SPINOFF_MIN, propertySpinnable, propertySpinoffValuation } from "../engine/spinoffs";
import type { GameState } from "../engine/types";
import { makeProperty, makeState } from "./factories";

/* Fastighets-avknoppning: ett distrikts bestånd noteras som eget PropCo.
   Husen stannar i portföljen (och på kartan) men taggas med spinOffId. */

function districtState(over: Partial<GameState> = {}): GameState {
  const portfolio = [0, 1, 2, 3].map((i) =>
    makeProperty({ id: 100 + i, district: "centrum", districtName: "Centrum", status: "klar", owned: true, askPrice: 5_000_000, baseRent: 40_000 }),
  );
  return makeState({ companyLevel: 4, cash: 20_000_000, portfolio, ...over });
}

describe("FASTIGHETS-AVKNOPPNING: värdering & behörighet", () => {
  it("värderar ett distrikts bestånd över noll", () => {
    const s = districtState();
    expect(propertySpinnable(s, "centrum").length).toBeGreaterThanOrEqual(PROPERTY_SPINOFF_MIN);
    expect(propertySpinoffValuation(s, "centrum")).toBeGreaterThan(0);
  });

  it("kräver bolagsnivå (group stage) för notering", () => {
    const s = districtState({ companyLevel: 2 });
    const after = reducer(s, { type: "SPIN_OFF_PROPERTIES", district: "centrum", floatPct: 0.4 });
    expect((after.spinOffs ?? []).length).toBe(0); // avvisat – ingen avknoppning
  });
});

describe("FASTIGHETS-AVKNOPPNING: notering", () => {
  it("skapar PropCo, taggar husen och ger emissionslikvid", () => {
    const s = districtState();
    const cash0 = s.cash;
    const after = reducer(s, { type: "SPIN_OFF_PROPERTIES", district: "centrum", floatPct: 0.4 });
    expect((after.spinOffs ?? []).length).toBe(1);
    const spin = after.spinOffs![0];
    expect(spin.kind).toBe("property");
    expect(spin.district).toBe("centrum");
    // Aktien noterad på börsen i fastighetssektorn.
    expect(after.stocks.some((st) => st.spinOffId === spin.id && st.sector === "fastighet")).toBe(true);
    // Husen står kvar i portföljen men är taggade.
    const tagged = after.portfolio.filter((p) => p.spinOffId === spin.id);
    expect(tagged.length).toBe(4);
    // Emissionslikviden landade i kassan.
    expect(after.cash).toBeGreaterThan(cash0);
    // Distriktet har inga fler otaggade hus att knoppa av.
    expect(propertySpinnable(after, "centrum").length).toBe(0);
  });

  it("dotterns kassa rör sig när en månad simuleras (NOI/underhåll routas)", () => {
    const listed = reducer(districtState(), { type: "SPIN_OFF_PROPERTIES", district: "centrum", floatPct: 0.4 });
    const spinId = listed.spinOffs![0].id;
    const next = advanceMonth(listed);
    const spin = (next.spinOffs ?? []).find((x) => x.id === spinId)!;
    expect(spin).toBeTruthy();
    expect(typeof spin.lastMonthNet).toBe("number");
    // Husen förblir taggade efter månadsskiftet.
    expect(next.portfolio.filter((p) => p.spinOffId === spinId).length).toBe(4);
  });
});
