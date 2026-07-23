/* Tunna delar 7/7: hyresgästernas livscykel. Veteran-pelare efter 5 år
   nöjd boende, och mänskliga livshändelser som gör att NÅGON bor där. */

import { describe, expect, it } from "vitest";
import {
  VETERAN_MONTHS,
  VETERAN_RISK_MULT,
  becomesVeteran,
  tenantLifeEvent,
} from "../engine/tenantLife";
import { clearRng, seedRng } from "../engine/random";
import { advanceMonth } from "../engine/simulation";
import type { GameState, Tenant } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

describe("VETERAN: pelaren i huset", () => {
  it("blir veteran vid 5 år nöjd boende, inte innan", () => {
    const happy = makeTenantFixture({ satisfaction: 80 });
    expect(becomesVeteran(happy, VETERAN_MONTHS)).toBe(true);
    expect(becomesVeteran(happy, VETERAN_MONTHS - 1)).toBe(false);
    // Missnöjd blir inte pelare oavsett tid.
    expect(becomesVeteran(makeTenantFixture({ satisfaction: 50 }), VETERAN_MONTHS + 20)).toBe(false);
    // Redan veteran triggar inte igen.
    expect(becomesVeteran({ ...happy, veteran: true } as Tenant, VETERAN_MONTHS + 5)).toBe(false);
  });

  it("veteranrabatten sänker konkursrisken", () => {
    expect(VETERAN_RISK_MULT).toBeLessThan(1);
  });

  it("simuleringen befordrar en långvarig nöjd hyresgäst", () => {
    seedRng(311);
    try {
      const t = makeTenantFixture({ id: 9100, satisfaction: 85, consecutiveMonths: VETERAN_MONTHS - 1, monthsLeft: 120, defaultRisk: 0.001 });
      let s = makeState({ portfolio: [makeProperty({ id: 9000, type: "bostad", capacity: 1, tenants: [t] })] });
      s = tick(s);
      const after = s.portfolio[0].tenants.find((x) => x.id === 9100);
      expect(after?.veteran).toBe(true);
      expect(s.log.some((e) => e.t.includes("pillar of the building"))).toBe(true);
    } finally {
      clearRng();
    }
  });
});

describe("LIVSHÄNDELSER: mänskliga ögonblick", () => {
  it("bara etablerade nöjda hyresgäster får ögonblick, och sällan", () => {
    const p = makeProperty({ type: "bostad" });
    const t = makeTenantFixture({ satisfaction: 80, consecutiveMonths: 12 });
    // Låg roll → händelse; hög roll → ingen.
    expect(tenantLifeEvent(t, p, 0.005, 0.5)).not.toBeNull();
    expect(tenantLifeEvent(t, p, 0.5, 0.5)).toBeNull();
    // Missnöjd/ny får inget.
    expect(tenantLifeEvent(makeTenantFixture({ satisfaction: 40, consecutiveMonths: 12 }), p, 0.005, 0.5)).toBeNull();
    expect(tenantLifeEvent(makeTenantFixture({ satisfaction: 80, consecutiveMonths: 2 }), p, 0.005, 0.5)).toBeNull();
  });

  it("kommersiella och bostäder får olika slags händelser", () => {
    const t = makeTenantFixture({ satisfaction: 80, consecutiveMonths: 12 });
    const home = tenantLifeEvent(t, makeProperty({ type: "bostad" }), 0.005, 0.1);
    const shop = tenantLifeEvent(t, makeProperty({ type: "butik", typeLabel: "Butik" }), 0.005, 0.1);
    expect(home?.text).toContain("baby");
    expect(shop?.text).toContain("contract");
    expect(home?.satDelta).toBeGreaterThan(0);
  });
});
