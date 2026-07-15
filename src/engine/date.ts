/* ============================================================
   Speldatum – riktig kalender ovanpå det 1-baserade spelåret.
   Spelår 1 = kalenderår 2000, och månaderna har verkliga längder
   (skottår vart fjärde år). year/month i GameState är OFÖRÄNDRADE
   (året är fortfarande 1-baserat) – all ekonomilogik och alla
   absolut-tidsvärden (year*12+month, matureAbs, builtYear ...) räknas
   precis som förut. Denna modul konverterar bara till visning, så
   spelaren ser "1 januari 2000" i stället för "1/1 · År 1".
   ============================================================ */

/** Spelår 1 motsvarar detta + 1 = kalenderår 2000. */
export const EPOCH_YEAR = 1999;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Kalenderår för ett givet 1-baserat spelår (spelår 1 → 2000). */
export function calYear(gameYear: number): number {
  return EPOCH_YEAR + gameYear;
}

/** Skottår enligt gregorianska regeln (2000 är skottår). */
export function isLeapYear(calendarYear: number): boolean {
  return (calendarYear % 4 === 0 && calendarYear % 100 !== 0) || calendarYear % 400 === 0;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Antal dagar i en månad (1..12) för ett givet spelår (skottårskoll på feb). */
export function daysInMonth(gameYear: number, month: number): number {
  const m = ((month - 1) % 12 + 12) % 12;
  if (m === 1 && isLeapYear(calYear(gameYear))) return 29;
  return DAYS[m];
}

/** Full datumsträng, t.ex. "1 januari 2000". */
export function formatGameDate(day: number, month: number, gameYear: number): string {
  const m = ((month - 1) % 12 + 12) % 12;
  return `${day} ${MONTH_NAMES[m]} ${calYear(gameYear)}`;
}

/** Månad + kalenderår, t.ex. "januari 2000". */
export function formatMonthYear(month: number, gameYear: number): string {
  const m = ((month - 1) % 12 + 12) % 12;
  return `${MONTH_NAMES[m]} ${calYear(gameYear)}`;
}
