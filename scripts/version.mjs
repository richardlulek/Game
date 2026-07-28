#!/usr/bin/env node
/* Versionsnumret bor på tre ställen och måste vara samma på alla tre:
   package.json (webbygget), src-tauri/Cargo.toml (Rust-kratet) och
   src-tauri/tauri.conf.json (det Windows visar i Egenskaper och det Steam
   ser). Går de isär märks det först när en spelare rapporterar en bugg mot
   en version som aldrig funnits.

     npm run version:check        – felar om de tre inte stämmer överens
     npm run version:set 2.1.0    – sätter alla tre

   Ett steg i RELEASE.md. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  pkg: join(root, "package.json"),
  cargo: join(root, "src-tauri", "Cargo.toml"),
  tauri: join(root, "src-tauri", "tauri.conf.json"),
};

function read() {
  return {
    pkg: JSON.parse(readFileSync(FILES.pkg, "utf8")).version,
    cargo: readFileSync(FILES.cargo, "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    tauri: JSON.parse(readFileSync(FILES.tauri, "utf8")).version,
  };
}

function check() {
  const v = read();
  if (new Set([v.pkg, v.cargo, v.tauri]).size !== 1) {
    console.error("Versionerna har gått isär:");
    console.error(`  package.json      ${v.pkg}`);
    console.error(`  Cargo.toml        ${v.cargo}`);
    console.error(`  tauri.conf.json   ${v.tauri}`);
    console.error("\nKör:  npm run version:set <version>");
    process.exit(1);
  }
  console.log(`Version ${v.pkg} – lika på alla tre ställen.`);
}

function set(next) {
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    console.error(`"${next}" är inte MAJOR.MINOR.PATCH (t.ex. 2.1.0).`);
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(FILES.pkg, "utf8"));
  const before = pkg.version;
  pkg.version = next;
  writeFileSync(FILES.pkg, `${JSON.stringify(pkg, null, 2)}\n`);

  // Bara den FÖRSTA version-raden i Cargo.toml är kratets egen – de som
  // följer tillhör beroenden.
  const cargo = readFileSync(FILES.cargo, "utf8");
  writeFileSync(FILES.cargo, cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`));

  const tauri = JSON.parse(readFileSync(FILES.tauri, "utf8"));
  tauri.version = next;
  writeFileSync(FILES.tauri, `${JSON.stringify(tauri, null, 2)}\n`);

  console.log(`${before} → ${next} i package.json, Cargo.toml och tauri.conf.json.`);
  console.log("Granska med `git diff` – det ska vara exakt tre rader.");
}

const arg = process.argv[2];
if (!arg || arg === "check") check();
else set(arg);
