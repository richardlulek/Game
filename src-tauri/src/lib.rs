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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_save, read_save])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
