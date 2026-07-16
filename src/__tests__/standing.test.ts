/* Tester för standing-systemet: åtkomst, justering och effekter. */

import { describe, expect, it } from "vitest";
import {
  adjustStanding,
  bankStanding,
  bankStandingTerms,
  cityScandalMult,
  cityStanding,
  rivalStanding,
  standingLabel,
} from "../engine/standing";
import { loanTerms } from "../engine/finance";
import { makeState } from "./factories";

describe("standing accessors", () => {
  it("är neutrala (0) som utgångsläge", () => {
    const s = makeState();
    expect(rivalStanding(s, "Northgate")).toBe(0);
    expect(bankStanding(s)).toBe(0);
    expect(cityStanding(s)).toBe(0);
  });
});

describe("adjustStanding", () => {
  it("nycklar per rival och klampar till ±100", () => {
    let st = adjustStanding(undefined, { kind: "rival", name: "Northgate" }, 40);
    st = adjustStanding(st, { kind: "rival", name: "Northgate" }, 80);
    expect(st.rivals!.Northgate).toBe(100); // klampad
    st = adjustStanding(st, { kind: "rival", name: "Wellspring" }, -150);
    expect(st.rivals!.Wellspring).toBe(-100);
    expect(st.rivals!.Northgate).toBe(100); // orörd
  });

  it("hanterar bank och city separat", () => {
    const st = adjustStanding(adjustStanding(undefined, { kind: "bank" }, 30), { kind: "city" }, -20);
    expect(st.bank).toBe(30);
    expect(st.city).toBe(-20);
  });
});

describe("standingLabel", () => {
  it("mappar band korrekt", () => {
    expect(standingLabel(80).label).toBe("Ally");
    expect(standingLabel(40).label).toBe("Cordial");
    expect(standingLabel(0).label).toBe("Neutral");
    expect(standingLabel(-40).label).toBe("Wary");
    expect(standingLabel(-80).label).toBe("Hostile");
  });
});

describe("bankStandingTerms → loanTerms", () => {
  it("neutral standing lämnar villkoren oförändrade", () => {
    const t = bankStandingTerms(makeState());
    expect(t.rateDelta).toBe(0);
    expect(t.ltvDelta).toBe(0);
  });

  it("god bankrelation ger billigare ränta och högre LTV", () => {
    const base = makeState({ reputation: 60 });
    const friendly = makeState({ reputation: 60, standing: { bank: 100 } });
    expect(loanTerms(friendly).spread).toBeLessThan(loanTerms(base).spread);
    expect(loanTerms(friendly).maxLtv).toBeGreaterThan(loanTerms(base).maxLtv);
  });
});

describe("cityScandalMult", () => {
  it("kommunens välvilja dämpar risken, agg göder den", () => {
    expect(cityScandalMult(makeState())).toBe(1);
    expect(cityScandalMult(makeState({ standing: { city: 100 } }))).toBeLessThan(1);
    expect(cityScandalMult(makeState({ standing: { city: -100 } }))).toBeGreaterThan(1);
  });
});
