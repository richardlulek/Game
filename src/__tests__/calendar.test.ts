import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceDay, advanceMonth } from "../engine/simulation";
import { calYear, daysInMonth, formatGameDate, formatMonthYear, isLeapYear } from "../engine/date";
import { makeProperty, makeState, makeTenantFixture } from "./factories";

// Math.random mockas till ett fast värde så simuleringen blir deterministisk
// (samma mönster som simulation.test.ts).
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function baseState() {
  const p = makeProperty({
    baseRent: 120_000,
    tenants: [makeTenantFixture({ rent: 10_000, monthsLeft: 24 })],
  });
  return makeState({
    portfolio: [p],
    cash: 100_000,
    debt: 1_200_000,
    reputation: 50,
    interestRate: 4.0,
    month: 6,
    day: 1,
    year: 1,
  });
}

describe("kalenderhjälpare (engine/date)", () => {
  it("spelår 1 är kalenderår 2000", () => {
    expect(calYear(1)).toBe(2000);
    expect(calYear(2)).toBe(2001);
  });

  it("skottår: 2000 har 29 dagar i februari", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(1, 2)).toBe(29); // spelår 1 = 2000
    expect(isLeapYear(2001)).toBe(false);
    expect(daysInMonth(2, 2)).toBe(28); // spelår 2 = 2001
  });

  it("riktiga månadslängder", () => {
    expect(daysInMonth(1, 1)).toBe(31); // januari
    expect(daysInMonth(1, 4)).toBe(30); // april
    expect(daysInMonth(1, 12)).toBe(31); // december
  });

  it("formaterar riktiga datum", () => {
    expect(formatGameDate(1, 1, 1)).toBe("1 January 2000");
    expect(formatMonthYear(6, 1)).toBe("June 2000");
  });
});

describe("rullande kalender – advanceDay", () => {
  it("mellan­dagar rör bara kalendern, inte ekonomin", () => {
    const s = baseState();
    const next = advanceDay(s);
    expect(next.day).toBe(2);
    expect(next.month).toBe(6);
    expect(next.year).toBe(1);
    expect(next.cash).toBe(s.cash);
    expect(next.log).toBe(s.log);
  });

  it("en full månad dagsticks ger EXAKT samma utfall som ett månadstick", () => {
    const start = baseState();

    // Väg A: ett direkt månadssteg (den orörda monoliten).
    const viaMonth = advanceMonth(start);

    // Väg B: rulla dag för dag genom hela månaden (juni = 30 dagar).
    let viaDays = start;
    const len = daysInMonth(start.year, start.month);
    for (let i = 0; i < len; i++) viaDays = advanceDay(viaDays);

    expect(viaDays.day).toBe(1);
    expect(viaDays.month).toBe(viaMonth.month);
    expect(viaDays.year).toBe(viaMonth.year);

    // Ekonomin är identisk – dagsticken lägger bara upplösning ovanpå.
    expect(viaDays.cash).toBe(viaMonth.cash);
    expect(viaDays.debt).toBe(viaMonth.debt);
    expect(viaDays.log).toEqual(viaMonth.log);
    expect(viaDays.history).toEqual(viaMonth.history);
  });

  it("rullar över årsskiftet med rätt månadslängder", () => {
    // Starta i december spelår 1, rulla december klart → januari spelår 2.
    let s = makeState({ month: 12, day: 1, year: 1, portfolio: [], competitors: [] });
    const len = daysInMonth(1, 12); // 31
    for (let i = 0; i < len; i++) s = advanceDay(s);
    expect(s.month).toBe(1);
    expect(s.year).toBe(2);
    expect(s.day).toBe(1);
    expect(calYear(s.year)).toBe(2001);
  });

  it("pausar tiden vid väntande beslut", () => {
    const s = { ...baseState(), pendingDecision: { id: "x" } as never };
    expect(advanceDay(s)).toBe(s);
  });
});
