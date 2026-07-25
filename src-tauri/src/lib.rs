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
        .invoke_handler(tauri::generate_handler![write_save, read_save, steam_unlock])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
