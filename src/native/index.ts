/* ============================================================
   Skal-agnostisk native-bro. Spelet pratar ALDRIG direkt med
   Tauri/Electron – bara genom detta gränssnitt. Byter man skal
   (t.ex. Tauri → Electron) byts bara implementationen här, resten
   av kodbasen står orörd.

   Just nu: ren runtime-detektering (ingen @tauri-apps/api-import),
   så webbygget förblir oberoende. När vi faktiskt vill anropa native
   (Steam-achievements, fil-dialoger, fönsterkontroll) läggs det till
   HÄR – lazy-importerat bakom isDesktop() så webben aldrig drar in det.
   ============================================================ */

/** Kör vi i ett desktop-skal (Tauri/Electron) eller i en vanlig webbläsare? */
export function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  // Tauri v2 exponerar __TAURI_INTERNALS__; v1/Electron-varianter täcks med.
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w || "electronAPI" in w;
}

/** Vilket skal kör vi under (för loggning/telemetri). */
export function shell(): "tauri" | "electron" | "web" {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as Record<string, unknown>;
  if ("__TAURI_INTERNALS__" in w || "__TAURI__" in w) return "tauri";
  if ("electronAPI" in w) return "electron";
  return "web";
}

/* Framtida native-anrop läggs till nedan, alltid webbsäkra (no-op/fallback
   när !isDesktop). Exempel på hur Steam-lagret kommer se ut:

   export const steam = {
     async unlockAchievement(id: string): Promise<void> {
       if (!isDesktop()) return;                       // webben: no-op
       const { invoke } = await import("@tauri-apps/api/core");
       await invoke("steam_unlock", { id });           // Rust-kommando
     },
   };
*/
