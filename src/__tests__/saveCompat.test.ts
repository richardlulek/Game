/* Sparfilernas bakåtkompatibilitet – det enda en patch kan göra som tar
   ifrån spelare något de inte får tillbaka.

   Golvet: en RIKTIG sparfil från varje släppt version ligger som fixtur i
   `fixtures/`, och sviten kräver att var och en fortfarande laddar och går
   att spela vidare. Bryter en migrering fångas det här, inte av en spelare
   som tappat trettio timmar.

   Vid varje höjning av SAVE_VERSION: generera en fixtur från den nya
   versionen och lägg till den nedan. Gamla fixturer tas ALDRIG bort förrän
   MIN_SAVE_VERSION passerat dem – då är det ett medvetet beslut som ska stå
   i patchnoten. Rutinen i sin helhet: RELEASE.md. */
import { describe, expect, it } from "vitest";
import { MIN_SAVE_VERSION, SAVE_VERSION, parseSaveFile } from "../store/persistence";
import { advanceMonth } from "../engine/simulation";
import { equityOf, portfolioValue } from "../engine/finance";
import { propMarketValue } from "../engine/property";
import saveV29 from "./fixtures/save-v29.json";

/** En fixtur per släppt sparfilsversion. Lägg till, ta aldrig bort. */
const FIXTURES: { version: number; file: unknown }[] = [
  { version: 29, file: saveV29 },
];

describe("sparfiler från tidigare versioner", () => {
  for (const { version, file } of FIXTURES) {
    const raw = () => JSON.stringify(file);

    describe(`v${version}`, () => {
      it("laddar", () => {
        const state = parseSaveFile(raw());
        expect(state).not.toBeNull();
        expect(state!.portfolio.length).toBeGreaterThan(0);
        expect(state!.portfolio.some((p) => p.tenants.length > 0)).toBe(true);
        expect(state!.year).toBeGreaterThan(0);
      });

      it("går att spela vidare – ett månadssteg utan att något går sönder", () => {
        const state = parseSaveFile(raw())!;
        const after = advanceMonth({ ...state, pendingDecision: null, auction: undefined });
        expect(after.year * 12 + after.month).toBeGreaterThan(state.year * 12 + state.month);
        expect(Number.isFinite(after.cash)).toBe(true);
        expect(Number.isFinite(equityOf(after))).toBe(true);
      });

      it("beståndet kan värderas – inga NaN ur en gammal fastighet", () => {
        const state = parseSaveFile(raw())!;
        for (const p of state.portfolio) {
          const value = propMarketValue(p, state);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
        expect(Number.isFinite(portfolioValue(state))).toBe(true);
      });

      it("ligger inom det spann som stöds", () => {
        expect(version).toBeGreaterThanOrEqual(MIN_SAVE_VERSION);
        expect(version).toBeLessThanOrEqual(SAVE_VERSION);
      });
    });
  }

  it("täcker den nuvarande versionen – annars saknas en fixtur", () => {
    expect(FIXTURES.map((f) => f.version)).toContain(SAVE_VERSION);
  });

  it("för gammal fil avvisas i stället för att laddas trasig", () => {
    expect(parseSaveFile(JSON.stringify({ version: MIN_SAVE_VERSION - 1, state: {} }))).toBeNull();
  });

  it("trasig fil kraschar inte spelet", () => {
    expect(parseSaveFile("{ inte json")).toBeNull();
  });
});
