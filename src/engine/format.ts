/* ============================================================
   Formatteringshjälpare (dollar). Funktionsnamnen kr/msek behålls
   som interna id:n (~350 anropsställen) – bara utdata är i USD.
   ============================================================ */

/** Heltal dollar, t.ex. "$1,234,567" (teckenmedvetet: "-$1,234"). */
export const kr = (n: number): string => {
  const abs = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
  return `${n < 0 ? "-" : ""}$${abs}`;
};

/** Miljoner/miljarder dollar med en decimal, t.ex. "$1.2M" eller "$1.90B"
 *  (teckenmedvetet). Belopp ≥ 1000 M skrivs i miljarder så statusrad och
 *  stora tal inte visar "$1903.9M". */
export const msek = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
};

/** Procent med en decimal, t.ex. "12.3%". Utan mellanslag före % för att
 *  matcha den dominerande stilen i UI:t. Förväntar ett tal i [0,1]. */
export const pct = (n: number): string => (n * 100).toFixed(1) + "%";
