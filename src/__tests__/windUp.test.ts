/* Ett bolag kan förlora sista huset på fler sätt än via förvaltaren – sålt på
   ett bud, avvecklat i en affär. Utan hus finns ingen hyra, och utan kapital
   till en kontantinsats finns ingen väg tillbaka. Förr rullade partiet vidare
   i tomma månader tills de fasta kostnaderna hann ikapp: i femtioårsmätningen
   stod ett bolag så i tio år och räknades ändå som levande.

   Nu avvecklas det – men först efter ett år, för marknaden byter annonser och
   läget kan hinna ändra sig. */
import { describe, expect, it } from "vitest";
import { advanceMonth } from "../engine/simulation";
import { makeProperty, makeState, makeTenantFixture } from "./factories";
import type { GameState } from "../engine/types";

/** Marknaden: ett objekt som kräver mer kontantinsats än bolaget har. */
const forSale = (ask = 8_000_000) => makeProperty({ id: 9, owned: false, status: "klar", askPrice: ask });

const stranded = (over: Partial<GameState> = {}) =>
  makeState({ cash: 100_000, debt: 0, portfolio: [], listings: [forSale()], ...over }) as GameState;

/** Stegar `months` månader och returnerar sluttillståndet. */
function run(s: GameState, months: number): GameState {
  let cur = s;
  for (let i = 0; i < months; i++) cur = advanceMonth({ ...cur, pendingDecision: null, auction: undefined });
  return cur;
}

describe("bolag utan hus och utan väg tillbaka", () => {
  it("avvecklas efter ett år", () => {
    const after = run(stranded(), 12);
    expect(after.gameOver).toBe(true);
    expect(after.gameOverReason?.title).toBe("The company is wound up");
  });

  it("lever kvar under året – marknaden hinner byta annonser", () => {
    const after = run(stranded(), 6);
    expect(after.gameOver).toBe(false);
    expect(after.emptyMonths).toBe(6);
  });

  it("varnar i god tid innan", () => {
    const after = run(stranded(), 6);
    expect(after.log.some((l) => /wound up in/.test(l.t))).toBe(true);
  });

  it("räknaren nollställs när bolaget kan köpa igen", () => {
    const s = run(stranded(), 5);
    expect(s.emptyMonths).toBe(5);
    // Ett kapitaltillskott räcker till kontantinsatsen igen.
    const funded = run({ ...s, cash: 50_000_000 }, 1);
    expect(funded.emptyMonths).toBe(0);
    expect(funded.gameOver).toBe(false);
  });

  it("den som äger ett hus avvecklas inte", () => {
    const s = stranded({
      cash: 100_000,
      portfolio: [makeProperty({ id: 1, baseRent: 1_200_000, capacity: 1, tenants: [makeTenantFixture({ id: 101, rent: 60_000 })] })],
    });
    const after = run(s, 14);
    expect(after.gameOverReason?.title).not.toBe("The company is wound up");
  });

  it("räcker kassan till en kontantinsats är bolaget inte strandat", () => {
    const after = run(stranded({ cash: 20_000_000 }), 14);
    expect(after.gameOver).toBe(false);
    expect(after.emptyMonths ?? 0).toBe(0);
  });

  it("avstängd konkurs stänger av även avvecklingen", () => {
    const after = run(stranded({ settings: { noBankruptcy: true, difficulty: "normal" } }), 14);
    expect(after.gameOver).toBe(false);
  });
});
