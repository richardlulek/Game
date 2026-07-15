/* ============================================================
   Formatteringshjälpare. Valutan är fortsatt SEK (kr/MSEK) men
   talformatet är en-US (grupptecken komma) för engelskt UI.
   ============================================================ */

/** Heltal kronor, t.ex. "1,234,567 kr". */
export const kr = (n: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n)) + " kr";

/** Miljoner kronor med en decimal, t.ex. "1.2 MSEK". */
export const msek = (n: number): string => (n / 1_000_000).toFixed(1) + " MSEK";

/** Procent med en decimal, t.ex. "12.3 %". Förväntar ett tal i [0,1]. */
export const pct = (n: number): string => (n * 100).toFixed(1) + " %";
