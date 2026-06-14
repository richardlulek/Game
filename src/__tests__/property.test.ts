import { describe, expect, it } from "vitest";
import {
  propAnnualOpex,
  propAnnualRent,
  propMarketValue,
  propNOI,
  propPotentialRent,
} from "../engine/property";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

describe("propMarketValue", () => {
  it("räknar area × base × condFactor × marketMod × growth × valueMult", () => {
    // Centrum: base 32000, growth 1.0. Skick 100 → condFactor = 0.6 + 0.6 = 1.2.
    // 1000 × 32000 × 1.2 × 1 × 1 × 1 = 38 400 000
    const p = makeProperty({ area: 1000, condition: 100 });
    expect(propMarketValue(p, makeState())).toBe(38_400_000);
  });

  it("halverar värdet för pågående bygge", () => {
    const klar = makeProperty({ area: 1000, condition: 100, status: "klar" });
    const bygger = makeProperty({ area: 1000, condition: 100, status: "bygger" });
    expect(propMarketValue(bygger, makeState())).toBe(propMarketValue(klar, makeState()) * 0.5);
  });
});

describe("propAnnualOpex", () => {
  it("är baseRent × opexFactor × opexMult × taxMod", () => {
    // Bostad opexFactor 0.28. 100000 × 0.28 × 1 × 1 = 28000
    const p = makeProperty({ baseRent: 100_000 });
    expect(propAnnualOpex(p, makeState())).toBeCloseTo(28_000, 6);
  });

  it("är 0 under bygge", () => {
    const p = makeProperty({ status: "bygger" });
    expect(propAnnualOpex(p, makeState())).toBe(0);
  });
});

describe("propAnnualRent", () => {
  it("är 0 för vakant lokal (oavsett potential)", () => {
    const p = makeProperty({ tenants: [] });
    expect(propAnnualRent(p, makeState())).toBe(0);
    // Potentialen är däremot positiv:
    expect(propPotentialRent(p, makeState())).toBeGreaterThan(0);
  });

  it("är kontraktshyra × 12 för uthyrt", () => {
    const p = makeProperty({ tenants: [makeTenantFixture({ rent: 10_000 })] });
    expect(propAnnualRent(p, makeState())).toBe(120_000);
  });

  it("är 0 under bygge", () => {
    const p = makeProperty({ status: "bygger", tenants: [makeTenantFixture()] });
    expect(propAnnualRent(p, makeState())).toBe(0);
  });
});

describe("propNOI (driftnetto)", () => {
  it("vakant: NOI = −opex", () => {
    const p = makeProperty({ baseRent: 100_000, tenants: [] });
    expect(propNOI(p, makeState())).toBeCloseTo(-28_000, 6);
  });

  it("uthyrt: NOI = årshyra − opex", () => {
    const p = makeProperty({ baseRent: 100_000, tenants: [makeTenantFixture({ rent: 50_000 })] });
    // 50000 × 12 − 28000 = 572000
    expect(propNOI(p, makeState())).toBeCloseTo(572_000, 6);
  });

  it("följer opexMult och taxMod", () => {
    const base = makeProperty({ baseRent: 100_000, tenants: [] });
    const lowerOpex = makeProperty({ baseRent: 100_000, tenants: [], opexMult: 0.8 });
    expect(propNOI(lowerOpex, makeState())).toBeGreaterThan(propNOI(base, makeState()));
    expect(propNOI(base, makeState({ taxMod: 1.04 }))).toBeLessThan(propNOI(base, makeState()));
  });
});
