import { describe, expect, it } from "vitest";
import {
  propAnnualOpex,
  propCapRate,
  propAnnualRent,
  propMarketValue,
  propNOI,
  propPotentialRent,
} from "../engine/property";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { PropTypeKey } from "../engine/types";

describe("propMarketValue", () => {
  /* Värderingen väger substansvärde mot avkastningsvärde (driftnetto genom
     avkastningskrav). Fixturen nedan har en realistisk hyresnivå: substans
     38,4 MSEK (1000 m² × 32 000 kr × condFactor 1,2) och ~2,2 MSEK årshyra,
     dvs ungefär den direktavkastning stadens riktiga objekt ligger på. */
  const realistic = (over = {}) =>
    makeProperty({ area: 1000, condition: 100, baseRent: 2_200_000, capacity: 4, ...over });

  /** Hyresgäster till marknadshyra, dvs stabiliserat läge. */
  const atMarketRent = (p: ReturnType<typeof realistic>, s = makeState()) => {
    const perUnit = propPotentialRent(p, s) / 12 / p.capacity;
    return {
      ...p,
      tenants: Array.from({ length: p.capacity }, (_, i) =>
        makeTenantFixture({ id: 500 + i, rent: perUnit }),
      ),
    };
  };

  it("ger fullt uthyrt objekt en premie mot substansvärdet", () => {
    const s = makeState();
    const full = atMarketRent(realistic(), s);
    // Bostad i centrum handlas på ett lägre avkastningskrav än vad enbart
    // substansen implicerar, så ett stabiliserat objekt värderas över den.
    const premium = propMarketValue(full, s) / 38_400_000 - 1;
    expect(premium).toBeGreaterThan(0.05);
    expect(premium).toBeLessThan(0.30);
  });

  it("värderar ned en tom fastighet rejält mot en fullt uthyrd", () => {
    const s = makeState();
    const full = propMarketValue(atMarketRent(realistic(), s), s);
    const empty = propMarketValue(realistic({ tenants: [] }), s);
    const drop = empty / full - 1;
    // Vakans ska bita ordentligt (tidigare bara −9 %), men inte utplåna värdet.
    expect(drop).toBeLessThan(-0.12);
    expect(drop).toBeGreaterThan(-0.35);
  });

  it("halverar det färdiga, stabiliserade värdet för pågående bygge", () => {
    const s = makeState();
    const full = atMarketRent(realistic({ status: "klar" }), s);
    const bygger = realistic({ status: "bygger" });
    // Bygget straffas inte för vakans – huset har inga hyresgäster ännu.
    expect(propMarketValue(bygger, s)).toBe(Math.round(propMarketValue(full, s) * 0.5));
  });

  it("värderar vakans gradvis – halvtomt ligger mellan fullt och tomt", () => {
    const s = makeState();
    const base = realistic();
    const perUnit = propPotentialRent(base, s) / 12 / base.capacity;
    const tenants = (n: number) =>
      Array.from({ length: n }, (_, i) => makeTenantFixture({ id: 700 + i, rent: perUnit }));
    const full = propMarketValue({ ...base, tenants: tenants(4) }, s);
    const half = propMarketValue({ ...base, tenants: tenants(2) }, s);
    const empty = propMarketValue({ ...base, tenants: [] }, s);
    expect(half).toBeLessThan(full);
    expect(empty).toBeLessThan(half);
  });

  it("ger en hyra över marknadsnivå ett högre värde än marknadshyra", () => {
    const s = makeState();
    const base = realistic();
    const perUnit = propPotentialRent(base, s) / 12 / base.capacity;
    const mk = (mult: number) => ({
      ...base,
      tenants: Array.from({ length: base.capacity }, (_, i) =>
        makeTenantFixture({ id: 800 + i, rent: perUnit * mult }),
      ),
    });
    expect(propMarketValue(mk(1.3), s)).toBeGreaterThan(propMarketValue(mk(1.0), s));
    expect(propMarketValue(mk(0.7), s)).toBeLessThan(propMarketValue(mk(1.0), s));
  });

  it("låter aldrig värdet kollapsa, även med orimligt låg hyra", () => {
    // Skydd mot att avkastningsbenet drar ned värdet mot noll om ett objekts
    // hyra är orealistisk i förhållande till substansen (mark + stomme har
    // alltid ett värde). Golvet är 50 % av substansvärdet, vilket efter
    // vägningen ger som lägst ~65 % av substansen.
    const s = makeState();
    const p = makeProperty({ area: 1000, condition: 100, baseRent: 1_000, capacity: 4, tenants: [] });
    // Substansvärde = 1000 × 32000 × 1.2 = 38,4 MSEK.
    expect(propMarketValue(p, s)).toBeGreaterThan(38_400_000 * 0.6);
  });
});

describe("propAnnualOpex", () => {
  it("är baseRent × opexFactor × opexMult × taxMod", () => {
    // Bostad opexFactor 0.23. 100000 × 0.23 × 1 × 1 = 23000
    const p = makeProperty({ baseRent: 100_000 });
    expect(propAnnualOpex(p, makeState())).toBeCloseTo(23_000, 6);
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
    expect(propNOI(p, makeState())).toBeCloseTo(-23_000, 6);
  });

  it("uthyrt: NOI = årshyra − opex", () => {
    const p = makeProperty({ baseRent: 100_000, tenants: [makeTenantFixture({ rent: 50_000 })] });
    // 50000 × 12 − 23000 = 577000
    expect(propNOI(p, makeState())).toBeCloseTo(577_000, 6);
  });

  it("följer opexMult och taxMod", () => {
    const base = makeProperty({ baseRent: 100_000, tenants: [] });
    const lowerOpex = makeProperty({ baseRent: 100_000, tenants: [], opexMult: 0.8 });
    expect(propNOI(lowerOpex, makeState())).toBeGreaterThan(propNOI(base, makeState()));
    expect(propNOI(base, makeState({ taxMod: 1.04 }))).toBeLessThan(propNOI(base, makeState()));
  });
});

/* ── Yieldstruktur ────────────────────────────────────────────────────────
   Marknaden prissätter RISK: samma driftnetto är värt olika mycket beroende
   på tillgångsslag och läge. Detta är den ekonomiska modellens kärna och
   ska inte kunna glida i tysthet. */
describe("avkastningskrav (yieldstruktur)", () => {
  const at = (type: PropTypeKey, district = "innerstad") =>
    makeProperty({
      type, district, area: 1000, condition: 100,
      baseRent: 2_200_000, capacity: 4,
      tenants: Array.from({ length: 4 }, (_, i) => makeTenantFixture({ id: 300 + i })),
    });

  it("bostad < kontor < butik < industri, allt annat lika", () => {
    const s = makeState();
    const y = (t: PropTypeKey) => propCapRate(at(t), s);
    expect(y("bostad")).toBeLessThan(y("kontor"));
    expect(y("kontor")).toBeLessThan(y("butik"));
    expect(y("butik")).toBeLessThan(y("industri"));
  });

  it("A-läge kräver lägre avkastning än osäkert läge – även för bostäder", () => {
    const s = makeState();
    const y = (d: string) => propCapRate(at("bostad", d), s);
    // Finansdistriktet (A-läge) < innerstad (referens) < förort < industriområde.
    expect(y("finans")).toBeLessThan(y("innerstad"));
    expect(y("innerstad")).toBeLessThan(y("förort"));
    expect(y("förort")).toBeLessThan(y("industri"));
  });

  it("samma driftnetto är värt mer i ett bättre läge", () => {
    const s = makeState();
    // Samma objekt, olika distrikt → lägre avkastningskrav ger högre värde.
    expect(propMarketValue(at("kontor", "finans"), s))
      .toBeGreaterThan(propMarketValue(at("kontor", "industri"), s));
  });

  it("vakans och eftersatt skick höjer avkastningskravet", () => {
    const s = makeState();
    const full = at("kontor");
    const empty = { ...full, tenants: [] };
    const worn = { ...full, condition: 30 };
    expect(propCapRate(empty, s)).toBeGreaterThan(propCapRate(full, s));
    expect(propCapRate(worn, s)).toBeGreaterThan(propCapRate(full, s));
  });
});
