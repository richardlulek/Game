import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relativ base ("./") gör att alla asset-sökvägar blir relativa, så bygget
  // fungerar oavsett vilken underväg spelet serveras från (root, /game/,
  // en preview-URL osv). Absolut base som "/Game/" ger 404 på JS/CSS när
  // hosten inte ligger på exakt den vägen → bara grön bakgrundssida.
  base: "./",
  server: {
    // Bevaka ALDRIG Rust-bygget (src-tauri/target skriver tusentals filer
    // under `tauri dev`). Utan detta kraschar Vites filbevakare med EBUSY,
    // särskilt om projektet ligger i en synkad mapp (OneDrive/Dropbox).
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    // Engine-testerna är ren TS utan DOM-beroenden.
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
