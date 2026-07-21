import { describe, expect, it } from "vitest";
import { RATE_LOCK_TERMS, TAX_DEP_AGGRESSIVE, TAX_DEP_NORMAL, loanTerms } from "../engine/finance";
import {
  DEPOSIT_CAMPAIGN_MONTHS,
  REINSURANCE_CEDE,
  insurerMonthlyNet,
  tickBank,
  tickInsurer,
} from "../engine/finInstitutions";
import { GREEN_BOND_DISCOUNT, bondRateFor, creditRatingOf } from "../engine/rating";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState, OwnedBank, OwnedInsurer } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

/* Finans 2.0: löptidskurva på räntebindningen, gröna obligationer med
   greenwashing-covenant, inlåningskampanj, återförsäkring, förlustavdrag
   och aggressiv avskrivning med revisionsrisk. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const bank = (over: Partial<OwnedBank> = {}): OwnedBank => ({
  name: "Testbanken", deposits: 60_000_000, loansOut: 39_000_000,
  stance: "balanserad", acquiredAbs: 0, totalNet: 0, ...over,
});
const insurer = (over: Partial<OwnedInsurer> = {}): OwnedInsurer => ({
  name: "Testförsäkring", policies: 500, pricing: "marknad",
  acquiredAbs: 0, totalNet: 0, ...over,
});

describe("RÄNTEBINDNING: löptidskurvan prissätter ränterisken", () => {
  it("längre bindning ger högre låst ränta och dyrare avgift", () => {
    const s0 = makeState({ cash: 20_000_000, debt: 100_000_000 });
    const base = loanTerms(s0).rate;
    const short = reducer(s0, { type: "SET_RATE_MODE", mode: "fixed", months: 12 });
    expect(short.fixedRate).toBeCloseTo(base + RATE_LOCK_TERMS[12].premium, 2);
    expect(s0.cash - short.cash).toBe(Math.round(100_000_000 * RATE_LOCK_TERMS[12].feePct));
    const long = reducer(s0, { type: "SET_RATE_MODE", mode: "fixed", months: 60 });
    expect(long.fixedRate).toBeCloseTo(base + RATE_LOCK_TERMS[60].premium, 2);
    expect(long.fixedRate!).toBeGreaterThan(short.fixedRate!);
    expect(s0.cash - long.cash).toBeGreaterThan(s0.cash - short.cash);
  });
});

describe("GRÖNA OBLIGATIONER: rabatt mot ESG-löfte", () => {
  const greenState = () => makeState({
    cash: 50_000_000,
    reputation: 80,
    portfolio: [
      makeProperty({ id: 1, energyClass: "A", tenants: [makeTenantFixture({ id: 11 })] }),
      makeProperty({ id: 2, energyClass: "A", tenants: [makeTenantFixture({ id: 12 })] }),
      makeProperty({ id: 3, energyClass: "A", tenants: [makeTenantFixture({ id: 13 })] }),
    ],
  });

  it("kräver ESG B eller bättre", () => {
    const dirty = makeState({
      cash: 50_000_000,
      reputation: 80,
      portfolio: [makeProperty({ id: 1, energyClass: "F" }), makeProperty({ id: 2, energyClass: "F" })],
    });
    const refused = reducer(dirty, { type: "ISSUE_BOND", amount: 5_000_000, years: 5, green: true });
    expect((refused.bonds ?? []).length).toBe(0);
  });

  it("ger kupongrabatt när portföljen kvalificerar", () => {
    const s = greenState();
    const info = creditRatingOf(s);
    expect(info.bondCap).toBeGreaterThan(1_000_000);
    const issued = reducer(s, { type: "ISSUE_BOND", amount: 5_000_000, years: 5, green: true });
    const b = issued.bonds![0];
    expect(b.green).toBe(true);
    expect(b.rate).toBeCloseTo(bondRateFor(s, info.rating) - GREEN_BOND_DISCOUNT, 2);
  });

  it("greenwashing-covenanten slår till när ESG-betyget rasar", () => {
    seedRng(3);
    try {
      // Grön obligation utestående men portföljen är numera F-klassad.
      let s = makeState({
        cash: 50_000_000,
        portfolio: [
          makeProperty({ id: 1, energyClass: "F", condition: 30 }),
          makeProperty({ id: 2, energyClass: "F", condition: 30 }),
        ],
        bonds: [{ id: "g1", amount: 5_000_000, rate: 4.0, matureAbs: 999, green: true }],
        reputation: 60,
      });
      s = tick(s);
      const b = s.bonds![0];
      expect(b.breached).toBe(true);
      expect(b.rate).toBeCloseTo(4.5, 2);
      // (Anseendestraffet −3 bokförs, men samma månads milstolpar kan höja
      // totalen – kontrollera händelsen i stället för nettosiffran.)
      expect(s.log.some((l) => l.t.includes("GREENWASHING"))).toBe(true);
    } finally { clearRng(); }
  });
});

describe("INSTITUT 2.0: kampanj och återförsäkring", () => {
  it("inlåningskampanjen lyfter inlåningen och räknar ned", () => {
    const s = makeState({ cash: 20_000_000, ownedBank: bank() });
    const started = reducer(s, { type: "START_DEPOSIT_CAMPAIGN" });
    expect(started.ownedBank?.campaignMonthsLeft).toBe(DEPOSIT_CAMPAIGN_MONTHS);
    expect(started.cash).toBeLessThan(s.cash);
    // Dubbelstart avvisas.
    expect(reducer(started, { type: "START_DEPOSIT_CAMPAIGN" }).cash).toBe(started.cash);
    // Seedad jämförelse: samma slumpdragningar, med/utan kampanj.
    seedRng(5);
    const withC = tickBank(bank({ campaignMonthsLeft: 12 }), s);
    clearRng();
    seedRng(5);
    const withoutC = tickBank(bank(), s);
    clearRng();
    expect(withC.bank.deposits).toBeGreaterThan(withoutC.bank.deposits);
    expect(withC.bank.campaignMonthsLeft).toBe(11);
  });

  it("återförsäkring: avstår premier men dämpar skadetoppar 60 %", () => {
    const s = makeState({});
    const base = insurer();
    const re = insurer({ reinsured: true });
    // Förväntat netto: exakt cede-andelen av premierna lägre.
    const premiums = 500 * 4_200 * 1.0;
    expect(insurerMonthlyNet(base, s) - insurerMonthlyNet(re, s)).toBe(Math.round(premiums * REINSURANCE_CEDE));
    // Hitta en seed där skadetoppen slår till och jämför toppens storlek.
    for (let seed = 1; seed < 60; seed++) {
      seedRng(seed);
      const a = tickInsurer(base, s);
      clearRng();
      if (a.events.length === 0) continue;
      const spike = insurerMonthlyNet(a.insurer, s) - a.net;
      seedRng(seed);
      const b = tickInsurer(re, s);
      clearRng();
      const spikeRe = insurerMonthlyNet(b.insurer, s) - b.net;
      expect(spikeRe).toBeLessThan(spike * 0.5);
      return;
    }
    throw new Error("ingen skadetopp på 60 seedar – otänkbart med 2,5 %/mån");
  });
});

describe("SKATT 2.0: förlustavdrag och aggressiv avskrivning", () => {
  it("underskott ackumuleras och kvittas mot framtida vinst", () => {
    seedRng(7);
    try {
      // Tung skuld utan intäkter ⇒ skattemässigt underskott varje månad.
      let s = makeState({ cash: 80_000_000, debt: 200_000_000, portfolio: [makeProperty({ id: 1 })] });
      s = tick(s);
      expect(s.taxLossCarry ?? 0).toBeGreaterThan(0);
      // Lönsam månad med stort sparat underskott ⇒ ingen skatt, avdraget minskar.
      const rented = makeProperty({
        id: 2, capacity: 2,
        tenants: [makeTenantFixture({ id: 21, rent: 900_000 }), makeTenantFixture({ id: 22, rent: 900_000 })],
      });
      let rich = makeState({ cash: 50_000_000, portfolio: [rented], taxLossCarry: 50_000_000 });
      rich = tick(rich);
      expect(rich.totalTaxPaid ?? 0).toBe(0);
      expect(rich.taxLossCarry!).toBeLessThan(50_000_000);
    } finally { clearRng(); }
  });

  it("aggressiv avskrivning sänker skatten – tills revisionen kommer", () => {
    const rented = () => makeProperty({
      id: 2, capacity: 2, askPrice: 30_000_000,
      tenants: [makeTenantFixture({ id: 21, rent: 900_000 }), makeTenantFixture({ id: 22, rent: 900_000 })],
    });
    const evergreen = () => makeProperty({
      id: 3, capacity: 2, askPrice: 30_000_000,
      tenants: [
        makeTenantFixture({ id: 31, rent: 900_000, monthsLeft: 9999, termTotal: 9999 }),
        makeTenantFixture({ id: 32, rent: 900_000, monthsLeft: 9999, termTotal: 9999 }),
      ],
    });
    expect(TAX_DEP_AGGRESSIVE).toBeGreaterThan(TAX_DEP_NORMAL);
    seedRng(9);
    let normal = makeState({ cash: 50_000_000, portfolio: [rented()] });
    normal = tick(normal);
    clearRng();
    seedRng(9);
    let agg = makeState({ cash: 50_000_000, portfolio: [rented()], taxDepreciationPolicy: "aggressiv" });
    agg = tick(agg);
    clearRng();
    expect(agg.totalTaxPaid ?? 0).toBeLessThan(normal.totalTaxPaid ?? 0);
    // Revisionen slår till förr eller senare. Många KORTA färska körningar
    // i stället för en lång: nöjdhetssystemet tömmer ett ounderhållet hus på
    // ~2 år, och därefter är månaderna olönsamma och revisionsgrinden stängd.
    let audited = false;
    for (let seed = 1; seed <= 60 && !audited; seed++) {
      seedRng(seed * 101);
      let s = makeState({ cash: 500_000_000, portfolio: [evergreen()], taxDepreciationPolicy: "aggressiv", reputation: 80 });
      for (let m = 0; m < 12 && !audited; m++) {
        s = { ...tick(s), taxDepreciationPolicy: "aggressiv" };
        if (s.log.some((l) => l.t.includes("TAX AUDIT"))) audited = true;
      }
      clearRng();
    }
    expect(audited).toBe(true);
  });
});
