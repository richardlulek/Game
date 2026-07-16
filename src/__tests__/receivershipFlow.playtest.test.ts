/* SPELTEST: hela rekonstruktionsflödet på ett ÄKTA genererat parti.
   Kör med PLAYTEST=1 (som 30-årssoaken). Spelar in i krisen via riktiga
   månadstick och tar sedan VARJE väg ut ur menyn: egen försäljning,
   brygglån, förvaltaren, deadline och konkursvalet. */

import { beforeEach, describe, expect, it } from "vitest";
import { seedRng } from "../engine/random";
import { reducer } from "../engine/reducer";
import { advanceMonth } from "../engine/simulation";
import { underRestructuringTerms, restructuringMonthsLeft } from "../engine/receivership";
import { amortInfoOf } from "../engine/finance";
import type { GameState } from "../engine/types";

declare const process: { env: Record<string, string | undefined> };
const suite = process.env.PLAYTEST === "1" ? describe : describe.skip;

const log = (msg: string) => console.log(`  ${msg}`);

// Deterministiskt: motorns PRNG seedas (gameStore gör detta i spelet;
// direkta motor-anrop i test måste göra det själva, annars flakar
// makrohändelserna partiet).
beforeEach(() => seedRng(4242));

/** Äkta parti: RESET genererar hela världen (190 hus, rivaler, listor).
 *  Extra startkassa så partiet kan bygga EGET KAPITAL – ett maxbelånat
 *  bolag är vid en krasch äkta insolvent (korrekt: konkurs, ingen meny). */
function newGame(): GameState {
  return reducer(
    { seed: 4242 } as unknown as GameState,
    { type: "RESET", scenarioId: "sandbox", companyName: "Playtest AB", options: { seed: 4242, cash: 20_000_000 } },
  );
}

/** Ett spelat månadstick: läs beslut och släpp auktioner (som en spelare),
 *  ticka sedan. advanceMonth är avsiktligt no-op medan någon av dem väntar. */
function tick(s: GameState): GameState {
  let st = s;
  let guard = 0;
  while (st.pendingDecision && guard++ < 5) {
    st = reducer(st, { type: "RESOLVE_DECISION", optionIndex: 0 });
  }
  if (st.auction) st = reducer(st, { type: "AUCTION_PASS" });
  return advanceMonth(st);
}

/** Köp de N billigaste annonserna (som en spelare skulle). */
function buyCheapest(s: GameState, n: number): GameState {
  let st = s;
  for (let i = 0; i < n; i++) {
    const cheapest = [...st.listings].sort((a, b) => a.askPrice - b.askPrice)[0];
    if (!cheapest) break;
    const before = st.portfolio.length;
    st = reducer(st, { type: "BUY", id: cheapest.id });
    if (st.portfolio.length === before) break; // hade inte råd
  }
  return st;
}

/** Spela in i krisen: dränera kassan (skriptad katastrof) + ett månadstick. */
function driveIntoCrisis(s: GameState): GameState {
  const drained = { ...s, cash: -2_500_000 };
  return tick(drained);
}

suite("SPELTEST: rekonstruktionsflödet ände till ände", () => {
  it("kris → alla fem vägarna ur menyn fungerar i ett riktigt parti", () => {
    // ── Uppspel: köp hus, amortera (bygg eget kapital), spela vidare ──
    let s = newGame();
    expect(s.portfolio.length).toBe(0);
    s = buyCheapest(s, 3);
    expect(s.portfolio.length).toBeGreaterThanOrEqual(2);
    // Amortera bort det mesta av köplånen – utan eget kapital är en krasch
    // äkta insolvens (verifieras separat längst ned).
    s = reducer(s, { type: "AMORT", amount: Math.min(s.cash - 2_000_000, s.debt) });
    for (let m = 0; m < 3; m++) s = tick(s);
    expect(s.gameOver).toBe(false);
    log(`Uppspel: ${s.portfolio.length} hus, kassa ${Math.round(s.cash / 1000)} tkr, skuld ${Math.round(s.debt / 1e6)} MSEK, månad ${s.month}/år ${s.year}`);

    // ── Krisen bryter ut ─────────────────────────────────────────────
    const crisis = driveIntoCrisis(s);
    if (!crisis.receivership) {
      log(`DEBUG: cash ${crisis.cash} gameOver ${crisis.gameOver} log: ${crisis.log.slice(0, 4).map((l) => l.t).join(" | ")}`);
    }
    expect(crisis.receivership).toBeDefined();
    expect(crisis.gameOver).toBe(false);
    expect(crisis.portfolio.length).toBe(s.portfolio.length); // inget auto-sålt
    log(`KRIS: rekonstruktion öppnad · kassa ${Math.round(crisis.cash / 1000)} tkr · rykte ${crisis.reputation} · bank ${crisis.standing?.bank}`);

    // ── Väg 1: spelaren säljer själv och löser ──────────────────────
    {
      let p1 = crisis;
      let guard = 0;
      while (p1.cash < 0 && guard++ < 10) {
        const sellable = p1.portfolio[0];
        if (!sellable) break;
        p1 = reducer(p1, { type: "RECEIVER_SELL", id: sellable.id });
      }
      expect(p1.cash).toBeGreaterThanOrEqual(0);
      p1 = reducer(p1, { type: "RESOLVE_RECEIVERSHIP" });
      expect(p1.receivership).toBeUndefined();
      expect(underRestructuringTerms(p1)).toBe(true);
      log(`Väg 1 (egen försäljning): löst · kassa ${Math.round(p1.cash / 1000)} tkr · villkor ${restructuringMonthsLeft(p1)} mån`);

      // Villkoren tvångsamorterar och löper sedan ut. (Rejäl kassa så att
      // 26-månadersloopen mäter villkoren – inte en ny kris.)
      const withDebt = { ...p1, debt: 5_000_000, cash: 10_000_000 };
      expect(amortInfoOf(withDebt).monthly).toBeGreaterThan(0);
      let p1b = withDebt;
      for (let m = 0; m < 26 && !p1b.gameOver; m++) p1b = tick(p1b);
      expect(p1b.gameOver).toBe(false);
      expect(underRestructuringTerms(p1b)).toBe(false);
      expect(p1b.debt).toBeLessThan(5_000_000); // tvångsamorteringen bet
      log(`Väg 1: villkoren löpte ut efter 24 mån · skuld ${(p1b.debt / 1e6).toFixed(1)} MSEK (amorterad från 5)`);
    }

    // ── Väg 2: brygglån – husen behålls ─────────────────────────────
    {
      let p2 = reducer(crisis, { type: "BRIDGE_LOAN" });
      expect(p2.cash).toBeGreaterThanOrEqual(0);
      expect(p2.portfolio.length).toBe(crisis.portfolio.length); // inget sålt
      expect(p2.bonds?.length).toBe(1);
      p2 = reducer(p2, { type: "RESOLVE_RECEIVERSHIP" });
      expect(p2.receivership).toBeUndefined();
      log(`Väg 2 (brygglån): ${Math.round((p2.bonds![0].amount) / 1000)} tkr @ ${p2.bonds![0].rate}% · husen kvar · löst`);
      // Räntan betalas månadsvis (obligationsmaskineriet) – spela 3 mån.
      let p2b = p2;
      for (let m = 0; m < 3; m++) p2b = tick(p2b);
      expect(p2b.gameOver).toBe(false);
    }

    // ── Väg 3: lämna över till förvaltaren ──────────────────────────
    {
      const p3 = reducer(crisis, { type: "RECEIVER_AUTO" });
      expect(p3.receivership).toBeUndefined();
      expect(p3.gameOver).toBe(false);
      expect(p3.cash).toBeGreaterThanOrEqual(0);
      expect(p3.portfolio.length).toBeLessThan(crisis.portfolio.length);
      log(`Väg 3 (förvaltaren): sålde ${crisis.portfolio.length - p3.portfolio.length} hus till −35 % · löst`);
    }

    // ── Väg 4: ignorera – deadline vid nästa månadsskifte ───────────
    {
      const p4 = advanceMonth(crisis);
      expect(p4.receivership).toBeUndefined();
      expect(p4.gameOver).toBe(false);
      expect(underRestructuringTerms(p4)).toBe(true);
      log(`Väg 4 (ignorerad): förvaltaren tog över vid månadsskiftet · villkor aktiva`);
    }

    // ── Väg 5: spelaren väljer konkurs ──────────────────────────────
    {
      const p5 = reducer(crisis, { type: "ACCEPT_BANKRUPTCY" });
      expect(p5.gameOver).toBe(true);
      log(`Väg 5 (konkursvalet): game over på spelarens initiativ`);
    }

    // ── Äkta insolvens: menyn öppnas aldrig ─────────────────────────
    {
      const broke = advanceMonth({ ...s, portfolio: [], worldPool: [], cash: -5_000_000, debt: 50_000_000 });
      expect(broke.gameOver).toBe(true);
      expect(broke.receivership).toBeUndefined();
      log(`Insolvens: konkurs direkt utan meny – korrekt`);
    }
  });
});
