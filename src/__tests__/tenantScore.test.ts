/* Tester för det publika hyresgästbetyget (Tenant Score). */

import { describe, expect, it } from "vitest";
import { tenantScoreOf } from "../engine/tenantScore";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

describe("tenantScoreOf", () => {
  it("ger ett neutralt utgångsläge utan hyresgäster", () => {
    const s = tenantScoreOf(makeState());
    expect(s.tenants).toBe(0);
    expect(s.score).toBe(68);
    expect(s.letter).toBe("C");
  });

  it("höga nöjdheter ger ett högt betyg", () => {
    const p = makeProperty({
      capacity: 2,
      tenants: [makeTenantFixture({ satisfaction: 92 }), makeTenantFixture({ id: 2, satisfaction: 88 })],
    });
    const s = tenantScoreOf(makeState({ portfolio: [p] }));
    expect(s.score).toBeGreaterThanOrEqual(85);
    expect(s.letter).toBe("A");
    expect(s.label).toBe("Beloved landlord");
  });

  it("presstemperatur (klagomål) drar ned betyget", () => {
    const p = makeProperty({ capacity: 1, tenants: [makeTenantFixture({ satisfaction: 70 })] });
    const clean = tenantScoreOf(makeState({ portfolio: [p] }));
    const heated = tenantScoreOf(makeState({ portfolio: [p], pressHeat: 12 }));
    expect(heated.score).toBeLessThan(clean.score);
    expect(heated.breakdown.complaintPenalty).toBeGreaterThan(0);
  });

  it("belönar lojala hyresgäster", () => {
    const loyal = makeProperty({ capacity: 1, tenants: [makeTenantFixture({ satisfaction: 70, consecutiveMonths: 30 })] });
    const fresh = makeProperty({ capacity: 1, tenants: [makeTenantFixture({ satisfaction: 70, consecutiveMonths: 1 })] });
    expect(tenantScoreOf(makeState({ portfolio: [loyal] })).breakdown.loyaltyBonus).toBeGreaterThan(0);
    expect(tenantScoreOf(makeState({ portfolio: [fresh] })).breakdown.loyaltyBonus).toBe(0);
  });

  it("straffar hög vakans", () => {
    const p = makeProperty({ capacity: 10, tenants: [makeTenantFixture({ satisfaction: 70 })] });
    const s = tenantScoreOf(makeState({ portfolio: [p] }));
    expect(s.breakdown.vacancyPenalty).toBeGreaterThan(0);
  });
});
