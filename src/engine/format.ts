/* ============================================================
   Formatteringshjälpare (dollar). Funktionsnamnen kr/msek behålls
   som interna id:n (~350 anropsställen) – bara utdata är i USD.
   ============================================================ */

/** Heltal dollar, t.ex. "$1,234,567" (teckenmedvetet: "-$1,234"). */
export const kr = (n: number): string => {
  const abs = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
  return `${n < 0 ? "-" : ""}$${abs}`;
};

/** Miljoner dollar med en decimal, t.ex. "$1.2M" (teckenmedvetet: "-$1.2M"). */
export const msek = (n: number): string => {
  const abs = (Math.abs(n) / 1_000_000).toFixed(1);
  return `${n < 0 ? "-" : ""}$${abs}M`;
};

/** Procent med en decimal, t.ex. "12.3 %". Förväntar ett tal i [0,1]. */
export const pct = (n: number): string => (n * 100).toFixed(1) + " %";
