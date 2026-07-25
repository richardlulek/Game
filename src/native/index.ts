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

/** Resultat av ett fil-native-anrop. "web" = kör webbläsarens fallback. */
export type FileResult = "saved" | "cancelled" | "web";

/** Spara sparfilstext via native "Spara som…"-dialog (desktop). Dialogen
 *  väljer sökväg; själva skrivningen sker i ett litet Rust-kommando (full
 *  diskåtkomst, ingen fs-scope att tappa på). Webben får "web" tillbaka och
 *  gör sin egen nedladdning. */
export async function saveGameFile(json: string, defaultName: string): Promise<FileResult> {
  if (!isDesktop()) return "web";
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Property Empire save", extensions: ["json"] }],
  });
  if (!path) return "cancelled";
  await invoke("write_save", { path, contents: json });
  return "saved";
}

/** Läs en sparfil via native "Öppna…"-dialog (desktop). Returnerar filens
 *  text, null om avbrutet, eller "web" så anroparen kör webb-fallback. */
export async function loadGameFile(): Promise<string | null | "web"> {
  if (!isDesktop()) return "web";
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Property Empire save", extensions: ["json"] }],
  });
  const path = typeof picked === "string" ? picked : null;
  if (!path) return null;
  return await invoke<string>("read_save", { path });
}
