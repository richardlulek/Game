import { describe, expect, it } from "vitest";
import {
  COVENANT_RATE_DELTA,
  CP_MAX_OF_EQUITY,
  CP_SPREAD,
  HOLDING_TAX_DELTA,
  TAX_RESERVE_TERM,
  equityOf,
  loanTerms,
} from "../engine/finance";
import {
  BANK_CAPITAL_FLOOR,
  bankCapitalOf,
  bankRequiredCapital,
  insurerMonthlyNet,
  tickBank,
} from "../engine/finInstitutions";
import { clearRng, seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import type { GameState, OwnedBank, OwnedInsurer } from "../engine/types";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

/* Finans 3.0: löptidsförlängning, covenant-lån, företagscertifikat,
   obligationsåterköp, bankkapital, hyresgaranti, periodiseringsfonder
   och holdingstruktur. */

function tick(s: GameState): GameState {
  return advanceMonth({ ...s, pendingDecision: null, auction: undefined });
}

const rentedProp = (id: number, rent = 900_000) => makeProperty({
  id, capacity: 2,
  tenants: [makeTenantFixture({ id: id * 10 + 1, rent }), makeTenantFixture({ id: id * 10 + 2, rent })],
});

const bank = (over: Partial<OwnedBank> = {}): OwnedBank => ({
  name: "Testbanken", deposits: 100_000_000, loansOut: 65_000_000,
  stance: "balanserad", acquiredAbs: 0, totalNet: 0, ...over,
});

describe("LÅN 3.0: löptid och covenant", () => {
  it("EXTEND_MATURITY flyttar förfallet 60 månader mot avgift", () => {
    const s = makeState({ cash: 10_000_000, debt: 100_000_000, debtMatureAbs: 20 });
    const next = reducer(s, { type: "EXTEND_MATURITY" });
    expect(next.debtMatureAbs).toBe(s.year * 12 + s.month + 60);
    expect(next.cash).toBe(s.cash - Math.max(100_000, Math.round(s.debt * 0.004)));
  });

  it("covenant-lånet kräver stark räntetäckning och sänker spreaden 0,25 pp", () => {
    // Svag ICR ⇒ banken säger nej.
    const weak = makeState({ cash: 5_000_000, debt: 300_000_000, portfolio: [rentedProp(1, 100_000)] });
    expect(reducer(weak, { type: "SET_LOAN_COVENANT", on: true }).loanCovenant).toBeUndefined();
    // Stark ICR ⇒ tecknas, och räntan sjunker exakt med rabatten.
    const strong = makeState({ cash: 5_000_000, debt: 20_000_000, portfolio: [rentedProp(1), rentedProp(2)] });
    const signed = reducer(strong, { type: "SET_LOAN_COVENANT", on: true });
    expect(signed.loanCovenant).toBeDefined();
    expect(loanTerms(strong).rate - loanTerms(signed).rate).toBeCloseTo(COVENANT_RATE_DELTA, 2);
  });

  it("tre svaga månader river covenanten med avgift", () => {
    seedRng(3);
    try {
      // Tung skuld, nästan inga hyror ⇒ ICR under golvet varje månad.
      let s = makeState({
        cash: 300_000_000,
        debt: 400_000_000,
        portfolio: [rentedProp(1, 30_000)],
        loanCovenant: { sinceAbs: 0, breachMonths: 0 },
      });
      for (let m = 0; m < 4 && s.loanCovenant; m++) s = tick(s);
      expect(s.loanCovenant).toBeUndefined();
      expect(s.log.some((l) => l.t.includes("COVENANT BREACH"))).toBe(true);
    } finally { clearRng(); }
  });
});

describe("KAPITALMARKNAD 3.0: certifikat och återköp", () => {
  it("certifikatprogrammet är billigare än banklån och begränsat till 15 % av equity", () => {
    const s = makeState({ cash: 10_000_000, portfolio: [rentedProp(1)] });
    const cap = Math.round(equityOf(s) * CP_MAX_OF_EQUITY);
    const issued = reducer(s, { type: "ISSUE_CP", amount: 999_000_000 });
    expect(issued.commercialPaper!.amount).toBe(cap);
    expect(issued.commercialPaper!.rate).toBeCloseTo(s.interestRate + CP_SPREAD, 2);
    expect(issued.commercialPaper!.rate).toBeLessThan(loanTerms(s).rate);
    expect(issued.cash).toBe(s.cash + cap);
  });

  it("i kris fryser marknaden: pappret bryggas in i banklånet", () => {
    seedRng(5);
    try {
      let s = makeState({
        cash: 1_000_000,
        debt: 10_000_000,
        portfolio: [rentedProp(1)],
        crisisMonthsLeft: 6,
        commercialPaper: { amount: 20_000_000, rate: 4.6, matureAbs: 0 },
      });
      s = tick(s);
      expect(s.commercialPaper).toBeUndefined();
      // Skulden växer med hela pappret (minus månadens amorteringskrav).
      expect(s.debt).toBeGreaterThan(29_000_000);
      expect(s.log.some((l) => l.t.includes("CP MARKET FROZEN"))).toBe(true);
    } finally { clearRng(); }
  });

  it("obligationer med låg kupong köps tillbaka under par när marknadsräntan stigit", () => {
    const s = makeState({
      cash: 20_000_000,
      interestRate: 9,
      portfolio: [rentedProp(1)],
      bonds: [{ id: "b1", amount: 10_000_000, rate: 3.0, matureAbs: 999 }],
    });
    const next = reducer(s, { type: "BUYBACK_BOND", bondId: "b1" });
    expect(next.bonds).toHaveLength(0);
    const paid = s.cash - next.cash;
    expect(paid).toBe(Math.round(10_000_000 * 0.85)); // klämd till golvet 85 % av par
  });
});

describe("INSTITUT 3.0: bankkapital, hyresgaranti, finanskoncern", () => {
  it("för lite kapital stryper utlåningen tills ägaren injicerar", () => {
    const s = makeState({ cash: 50_000_000 });
    const thin = bank({ capital: 1_000_000 });
    const fat = bank({ capital: bankRequiredCapital(bank()) });
    seedRng(7);
    const a = tickBank(thin, s);
    clearRng();
    seedRng(7);
    const b = tickBank(fat, s);
    clearRng();
    expect(a.bank.loansOut).toBeLessThan(b.bank.loansOut);
    // Injektion löser kravet; utdelning stoppas vid golvet.
    const st = makeState({ cash: 50_000_000, ownedBank: thin });
    const injected = reducer(st, { type: "BANK_INJECT_CAPITAL", amount: 20_000_000 });
    expect(bankCapitalOf(injected.ownedBank!)).toBe(21_000_000);
    const blocked = reducer(
      makeState({ cash: 0, ownedBank: bank({ capital: bankRequiredCapital(bank()) }) }),
      { type: "BANK_EXTRACT_CAPITAL", amount: 10_000_000 },
    );
    expect(bankCapitalOf(blocked.ownedBank!)).toBe(bankRequiredCapital(bank()));
    expect(BANK_CAPITAL_FLOOR).toBe(0.08);
  });

  it("hyresgarantin tjänar i stabilt läge och blöder i bust", () => {
    const ins = (g: boolean): OwnedInsurer => ({
      name: "F", policies: 500, pricing: "marknad", acquiredAbs: 0, totalNet: 0, rentGuarantee: g,
    });
    const stable = makeState({});
    const bust = makeState({ marketCycle: { phase: "bust", monthsRemaining: 10 } });
    expect(insurerMonthlyNet(ins(true), stable)).toBeGreaterThan(insurerMonthlyNet(ins(false), stable));
    expect(insurerMonthlyNet(ins(true), bust)).toBeLessThan(insurerMonthlyNet(ins(false), bust));
  });

  it("finanskoncernen korsförsäljer: +6 % med både bank och försäkring", () => {
    const ins: OwnedInsurer = { name: "F", policies: 500, pricing: "marknad", acquiredAbs: 0, totalNet: 0 };
    const alone = makeState({});
    const group = makeState({ ownedBank: bank() });
    expect(insurerMonthlyNet(ins, group)).toBeGreaterThan(insurerMonthlyNet(ins, alone));
  });
});

describe("SKATT 3.0: periodiseringsfond och holding", () => {
  it("avsättningen skjuter upp skatt och återförs efter 6 år", () => {
    const profitable = () => makeState({ cash: 50_000_000, portfolio: [rentedProp(1)] });
    const s = profitable();
    const allocated = reducer(s, { type: "ALLOCATE_TAX_RESERVE", amount: 2_000_000 });
    expect(allocated.taxReserves).toHaveLength(1);
    expect(allocated.taxLossCarry).toBe(2_000_000);
    expect(allocated.taxReserves![0].dueAbs).toBe(s.year * 12 + s.month + TAX_RESERVE_TERM);
    // Förfallen fond återförs till beskattning.
    seedRng(9);
    let due: GameState = { ...profitable(), taxReserves: [{ amount: 5_000_000, dueAbs: 0 }] };
    due = tick(due);
    clearRng();
    expect(due.taxReserves).toHaveLength(0);
    expect(due.log.some((l) => l.t.includes("returns to taxation"))).toBe(true);
  });

  it("holdingstrukturen sänker skattesatsen 2 pp permanent", () => {
    const mk = (holding: boolean) => makeState({
      cash: 100_000_000, companyLevel: 5, portfolio: [rentedProp(1)],
      holdingStructure: holding || undefined,
    });
    // Nivågrind.
    expect(reducer(makeState({ cash: 100_000_000, companyLevel: 4 }), { type: "FORM_HOLDING" }).holdingStructure).toBeUndefined();
    const formed = reducer(mk(false), { type: "FORM_HOLDING" });
    expect(formed.holdingStructure).toBe(true);
    expect(formed.cash).toBeLessThan(100_000_000);
    // Skatten blir lägre med holding (seedade jämförelser, samma slump).
    seedRng(11);
    const plain = tick(mk(false));
    clearRng();
    seedRng(11);
    const held = tick(mk(true));
    clearRng();
    expect(held.totalTaxPaid ?? 0).toBeLessThan(plain.totalTaxPaid ?? 0);
    expect(HOLDING_TAX_DELTA).toBe(0.02);
  });
});
