// Spelets Rust-sida. Tunt skal som laddar webbygget + minimalt native-API.
//
// Fil-I/O för spara/ladda görs här som två små kommandon (std::fs, full
// diskåtkomst – ingen fs-plugin-scope att tappa på). Sökvägen väljs på
// frontend via dialog-pluginet, se src/native/index.ts. Steam-kommandon
// registreras här på samma sätt när app-ID:t finns.

/// Skriv text till en användarvald sökväg (från "Spara som…"-dialogen).
#[tauri::command]
fn write_save(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Läs text från en användarvald sökväg (från "Öppna…"-dialogen).
#[tauri::command]
fn read_save(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/* ── Slot-sparningar som riktiga filer ────────────────────────────────────
   Spelet autosparar i localStorage (snabbt, funkar på webben). På desktop
   speglas varje sparning HIT, till <appdata>/saves/slot-N.json, så att:
     · Steam Cloud kan synka mappen (Auto-Cloud pekas på den),
     · spelaren kan säkerhetskopiera och flytta sina sparningar,
     · progressionen överlever att webview-datan rensas.
   Läsning sker vid uppstart och vinner om filen är nyare än localStorage. */

use tauri::Manager;

/// Mappen där sparfilerna hamnar. Skapas om den saknas.
fn saves_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("saves");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Sökvägen till sparmappen – visas i UI:t och används när Steam Auto-Cloud
/// ska konfigureras.
#[tauri::command]
fn save_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(saves_dir(&app)?.to_string_lossy().into_owned())
}

/// Skriv en slot till fil. Skrivs först till en temporärfil och byts sedan in,
/// så ett strömavbrott mitt i aldrig lämnar en trasig sparfil efter sig.
#[tauri::command]
fn save_slot(app: tauri::AppHandle, slot: u8, contents: String) -> Result<(), String> {
    let dir = saves_dir(&app)?;
    let tmp = dir.join(format!("slot-{slot}.json.tmp"));
    let dst = dir.join(format!("slot-{slot}.json"));
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dst).map_err(|e| e.to_string())?;
    Ok(())
}

/// Läs en slot från fil. Saknas filen returneras None (inte fel).
#[tauri::command]
fn load_slot(app: tauri::AppHandle, slot: u8) -> Result<Option<String>, String> {
    let path = saves_dir(&app)?.join(format!("slot-{slot}.json"));
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Steam-achievement – STOMME. Loggar bara tills Steamworks kopplas på.
/// När du har app-ID + Steamworks-SDK: lägg `steamworks`-craten i Cargo.toml,
/// initiera klienten i run() nedan och lagra den i Tauri-state, och byt
/// kroppen här mot:
///     client.user_stats().achievement(&id).set()?;
///     client.user_stats().store_stats()?;
/// (samt en bakgrundstråd som pumpar client.run_callbacks()).
#[tauri::command]
fn steam_unlock(id: String) -> Result<(), String> {
    println!("[steam] unlock achievement (stub): {id}");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            write_save,
            read_save,
            save_dir,
            save_slot,
            load_slot,
            steam_unlock
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
