/* Tester för bokslutet: resultaträkningen speglar simulationens formler
   och balansräkningen balanserar mot equityOf (som nu drar av
   obligationer och revolverkredit). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balansrakning, resultatrakning } from "../engine/bokslut";
import { TAX_DEP_NORMAL, equityOf, loanTerms } from "../engine/finance";
import { propAnnualOpex, propMarketValue } from "../engine/property";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("resultaträkningen", () => {
  it("summerar hyror, drift, ränta och skatt enligt simulationens formler", () => {
    const p = makeProperty({
      id: 1,
      purchasePrice: 2_000_000,
      tenants: [makeTenantFixture({ rent: 50_000 })],
    });
    const s = makeState({ cash: 1_000_000, debt: 1_000_000, portfolio: [p] });
    const rr = resultatrakning(s);

    expect(rr.hyresintakter).toBe(50_000);
    expect(rr.driftkostnader).toBe(Math.round(propAnnualOpex(p, s) / 12));
    expect(rr.rantekostnad).toBe(Math.round((1_000_000 * (loanTerms(s).rate / 100)) / 12));
    expect(rr.rorelseresultat).toBe(rr.summaIntakter - rr.summaKostnader);
    // Skatt: 22 % på (resultat − avskrivningsavdrag enligt normalpolicyn)
    // – samma sats som simulationen (bokslutet använde tidigare 2 % medan
    // simulationen drog 1,3 %, så skatteraden ljög).
    const avdrag = Math.round((2_000_000 * TAX_DEP_NORMAL) / 12);
    expect(rr.avskrivningsavdrag).toBe(avdrag);
    expect(rr.skatt).toBe(Math.round(Math.max(0, rr.resultatForeSkatt - avdrag) * 0.22));
    expect(rr.resultat).toBe(rr.resultatForeSkatt - rr.skatt);
  });

  it("räknar direktörsarvode, kontorskostnad och obligationsränta", () => {
    const s = makeState({
      portfolio: [makeProperty({ id: 1, tenants: [makeTenantFixture()] })],
      globalManager: { active: true, minCondition: 40, minTenantQuality: 0.8, rentTargetPct: 1 },
      companyLevel: 2,
      bonds: [{ id: "b1", amount: 1_200_000, rate: 12, matureAbs: 999 }],
    });
    const rr = resultatrakning(s);
    expect(rr.forvaltning).toBe(15_000 + 1 * 1_500);
    expect(rr.kontor).toBe(9_000); // nivå 2-kontoret
    expect(rr.rantekostnad).toBe(12_000); // 1.2 M × 12 % / 12
  });
});

describe("balansräkningen", () => {
  it("balanserar: eget kapital = tillgångar − skulder = equityOf", () => {
    const p = makeProperty({ id: 1, tenants: [makeTenantFixture()] });
    const s = makeState({
      cash: 3_000_000,
      debt: 2_000_000,
      portfolio: [p],
      bonds: [{ id: "b1", amount: 500_000, rate: 8, matureAbs: 999 }],
      revolving: { limit: 1_000_000, used: 200_000 },
    });
    const br = balansrakning(s);
    expect(br.fastigheter).toBe(Math.round(propMarketValue(p, s)));
    expect(br.summaSkulder).toBe(2_000_000 + 500_000 + 200_000);
    expect(br.egetKapital).toBe(br.summaTillgangar - br.summaSkulder);
    expect(br.egetKapital).toBe(Math.round(equityOf(s)));
  });

  it("obligationer blåser inte längre upp eget kapital", () => {
    const utan = makeState({ cash: 1_000_000 });
    const med = makeState({
      cash: 1_000_000 + 500_000, // emissionslikviden in på kassan …
      bonds: [{ id: "b1", amount: 500_000, rate: 8, matureAbs: 999 }], // … och skulden bokförd
    });
    expect(equityOf(med)).toBe(equityOf(utan));
  });

  it("institut syns i både resultat- och balansräkning (användarrapport)", () => {
    const s = makeState({
      cash: 10_000_000,
      portfolio: [makeProperty({ id: 1, tenants: [makeTenantFixture()] })],
      ownedBank: { name: "B", deposits: 100_000_000, loansOut: 65_000_000, stance: "balanserad", acquiredAbs: 0, totalNet: 0 },
      ownedInsurer: { name: "F", policies: 500, pricing: "marknad", acquiredAbs: 0, totalNet: 0 },
    });
    const rr = resultatrakning(s);
    // Bank- och försäkringsrörelsens löpande netto är egna intäktsrader...
    expect(rr.bankrorelse).not.toBe(0);
    expect(rr.forsakringsrorelse).toBeGreaterThan(0);
    expect(rr.summaIntakter).toBe(
      rr.hyresintakter + rr.industrinetto + rr.utdelningar +
      rr.bankrorelse + rr.forsakringsrorelse + rr.dotterbolagsvinst + rr.avknoppningsutdelning,
    );
    // ...och institutens värde ligger i balansräkningen, så eget kapital
    // stämmer med HUD:ens equityOf (gapet var användarens rapport).
    const br = balansrakning(s);
    expect(br.institut).toBeGreaterThan(0);
    expect(br.egetKapital).toBe(Math.round(equityOf(s)));
  });
});
