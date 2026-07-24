/* ============================================================
   Spelarinställningar som inte hör till en enskild sparfil –
   autospar och reducerad rörelse. Lagras i localStorage och läses
   av inställningsmenyn samt spel-loopen. Robust mot privatläge där
   localStorage kan kasta.
   ============================================================ */

const AUTOSAVE_KEY = "fastighetsimperium:autosave";
const REDUCE_MOTION_KEY = "fastighetsimperium:reduceMotion";

/** Autospar till aktiv slot vid varje månadsskifte. Standard: på. */
export function getAutosave(): boolean {
  try { return localStorage.getItem(AUTOSAVE_KEY) !== "off"; }
  catch { return true; }
}

export function setAutosave(on: boolean): void {
  try { localStorage.setItem(AUTOSAVE_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

/** Hoppa över berättelsens kamerapauser och korta ned svep. Standard: av. */
export function getReduceMotion(): boolean {
  try { return localStorage.getItem(REDUCE_MOTION_KEY) === "on"; }
  catch { return false; }
}

export function setReduceMotion(on: boolean): void {
  try { localStorage.setItem(REDUCE_MOTION_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}
