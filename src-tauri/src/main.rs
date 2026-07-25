// Göm konsolfönstret i release på Windows (annars blinkar en terminal upp).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    property_empire_lib::run()
}
