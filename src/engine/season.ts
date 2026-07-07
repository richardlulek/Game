/* ============================================================
   Årstider – ren funktion av månaden. Används för stämning
   (kartans färg, snö) och säsongseffekter i framtiden.
   ============================================================ */

export type Season = "vinter" | "vår" | "sommar" | "höst";

/** Returnerar årstid för en given månad (1–12, svensk indelning). */
export function seasonOf(month: number): Season {
  const m = ((month - 1) % 12) + 1;
  if (m === 12 || m <= 2) return "vinter";
  if (m <= 5) return "vår";
  if (m <= 8) return "sommar";
  return "höst";
}
