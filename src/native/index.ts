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

/* ── Steam ────────────────────────────────────────────────────────────────
   Skelett. På webben: no-op. På desktop: anropar Rust-kommandot steam_unlock,
   som just nu bara loggar (ingen steamworks-crate än). När app-ID + Steamworks-
   SDK finns byts Rust-sidan mot riktiga anrop – FRONTEND-koden nedan står orörd.
   Allt är fel-tolerant: saknas kommandot kraschar aldrig spelet. */
export const steam = {
  /** Lås upp en achievement. Anropas från spelhändelser (se ACHIEVEMENTS). */
  async unlock(id: string): Promise<void> {
    if (!isDesktop()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("steam_unlock", { id });
    } catch {
      /* Steam ej igång / kommando saknas – tyst no-op, aldrig krasch. */
    }
  },
};

/** Planerade achievement-ID:n (matchar det man definierar i Steamworks
 *  backend). Anropa steam.unlock(ACHIEVEMENTS.x) på rätt ställe i spelet när
 *  Steam-lagret är på. Inget är inkopplat i spelhändelser ännu – det är ett
 *  designsteg som görs när ID:na är låsta i Steamworks. */
export const ACHIEVEMENTS = {
  firstProperty: "first_property",   // köp din första fastighet
  firstMillion: "equity_1m",         // nå 1 MSEK eget kapital
  fiftyMillion: "equity_50m",        // nå 50 MSEK
  billionaire: "equity_1b",          // nå 1 miljard
  campaignDone: "campaign_complete", // klara kampanjen
  districtDominance: "own_district", // äg ett helt distrikt
  hostileTakeover: "hostile_win",    // vinn ett fientligt bud
} as const;

/* ── Slot-sparningar på disk (desktop) ────────────────────────────────────
   Spelet autosparar i localStorage. På desktop speglas varje sparning även
   till <appdata>/saves/slot-N.json via Rust, så att Steam Cloud kan synka
   dem, spelaren kan säkerhetskopiera, och progressionen överlever att
   webview-datan rensas. På webben är allt nedan tysta no-ops. */

/** Skriv en slot till disk. Returnerar false på webben eller vid fel. */
export async function writeSlotFile(slot: number, json: string): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_slot", { slot, contents: json });
    return true;
  } catch (e) {
    console.warn("Could not mirror the save file to disk:", e);
    return false;
  }
}

/** Läs en slot från disk. null = finns inte / webben / fel. */
export async function readSlotFile(slot: number): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<string | null>("load_slot", { slot })) ?? null;
  } catch (e) {
    console.warn("Could not read the save file from disk:", e);
    return null;
  }
}

/** Mappen sparfilerna ligger i (för Steam Auto-Cloud och UI). null på webben. */
export async function saveFolder(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("save_dir");
  } catch {
    return null;
  }
}

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
    filters: [{ name: "The Landlord save", extensions: ["json"] }],
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
    filters: [{ name: "The Landlord save", extensions: ["json"] }],
  });
  const path = typeof picked === "string" ? picked : null;
  if (!path) return null;
  return await invoke<string>("read_save", { path });
}
