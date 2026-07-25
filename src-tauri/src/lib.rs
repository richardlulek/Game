// Spelets Rust-sida. Just nu bara ett tunt skal som laddar webbygget.
// Framtida native-kommandon (Steam, filsystem) registreras här med
// .invoke_handler(tauri::generate_handler![...]) och anropas från
// frontend via src/native/index.ts.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
